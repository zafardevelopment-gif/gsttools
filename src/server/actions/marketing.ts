"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";
import { sendNotification } from "@/server/notifications";

export type ActionResult = { ok?: true; error?: string; sent?: number };

const campaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required."),
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  template: z.string().trim().optional(),
  body: z.string().trim().min(1, "Message body is required."),
  audience: z.enum(["all", "customers", "suppliers"]).default("customers"),
});

/** Create a draft campaign. */
export async function createCampaignAction(
  input: z.input<typeof campaignSchema>,
): Promise<ActionResult> {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase.from("aimunim_campaigns").insert({
    tenant_id: tenantId,
    name: v.name,
    channel: v.channel,
    template: v.template || null,
    body: v.body,
    audience: v.audience,
  });
  if (error) return { error: error.message };
  revalidatePath("/marketing");
  return { ok: true };
}

/**
 * Send a campaign to its audience through NotificationService (one logged,
 * auditable path — the same builder works for WhatsApp today and SMS later).
 */
export async function sendCampaignAction(campaignId: string): Promise<ActionResult> {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("aimunim_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", campaignId)
    .single();
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status === "sending") return { error: "Campaign is already sending." };

  let partiesQuery = supabase
    .from("aimunim_parties")
    .select("id, name, phone, type")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("phone", "is", null);
  if (campaign.audience === "customers") {
    partiesQuery = partiesQuery.in("type", ["customer", "both"]);
  } else if (campaign.audience === "suppliers") {
    partiesQuery = partiesQuery.in("type", ["supplier", "both"]);
  }
  const { data: parties } = await partiesQuery;
  if (!parties?.length) return { error: "No parties with phone numbers in this audience." };

  await supabase
    .from("aimunim_campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId);

  let sent = 0;
  for (const p of parties) {
    if (!p.phone) continue;
    const { results } = await sendNotification({
      tenantId,
      type: "marketing",
      recipient: p.phone,
      body: campaign.body ?? "",
      template: campaign.template ?? undefined,
      params: { name: p.name },
      entityType: "campaign",
      entityId: campaignId,
      channelOverride: campaign.channel,
    });
    if (results.some((r) => r.result.status === "sent")) sent += 1;
  }

  await supabase
    .from("aimunim_campaigns")
    .update({ status: "sent", sent_count: sent })
    .eq("id", campaignId);

  revalidatePath("/marketing");
  return { ok: true, sent };
}
