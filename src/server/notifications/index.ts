import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import {
  WhatsAppProvider,
  SmsProvider,
  type NotificationProvider,
  type SendResult,
} from "./providers";

/**
 * NotificationService — the ONE outbound-messaging path for the whole app
 * (invoice auto-share, payment reminders, receipts, marketing campaigns,
 * n8n-triggered sends). Never call a channel provider directly.
 *
 * Channel selection comes from the tenant's `notification_channel` setting
 * ('whatsapp' | 'sms' | 'both'), defaulting to WhatsApp-first per spec.
 * Every attempt (including skips) lands in aimunim_notification_logs.
 */

export type NotificationType =
  | "invoice_generated"
  | "payment_reminder"
  | "payment_received"
  | "order_status"
  | "marketing";

export type SendInput = {
  tenantId: string;
  type: NotificationType;
  recipient: string; // phone number
  /** Rendered message body (SMS) / source of WA template params. */
  body: string;
  /** Explicit template name; defaults to the notification type. */
  template?: string;
  params?: Record<string, string>;
  entityType?: string;
  entityId?: string;
  /** Force a channel (used by campaigns); otherwise the tenant setting rules. */
  channelOverride?: "whatsapp" | "sms";
};

const providers: Record<"whatsapp" | "sms", NotificationProvider> = {
  whatsapp: new WhatsAppProvider(),
  sms: new SmsProvider(),
};

export async function sendNotification(
  input: SendInput,
): Promise<{ results: { channel: string; result: SendResult }[] }> {
  const admin = createAdminClient();

  // Resolve the tenant's configured channel (WhatsApp by default).
  let channels: ("whatsapp" | "sms")[];
  if (input.channelOverride) {
    channels = [input.channelOverride];
  } else {
    const { data: tenant } = await admin
      .from("aimunim_tenants")
      .select("notification_channel")
      .eq("id", input.tenantId)
      .single();
    const setting = tenant?.notification_channel ?? "whatsapp";
    channels = setting === "both" ? ["whatsapp", "sms"] : [setting];
  }

  const template = input.template ?? input.type;
  const results: { channel: string; result: SendResult }[] = [];

  for (const channel of channels) {
    const result = await providers[channel].send({
      to: input.recipient,
      template,
      body: input.body,
      params: input.params,
    });

    await admin.from("aimunim_notification_logs").insert({
      tenant_id: input.tenantId,
      channel,
      template,
      recipient: input.recipient,
      status: result.status,
      error: result.error ?? null,
      payload: {
        type: input.type,
        body: input.body,
        params: input.params ?? {},
        provider_id: result.providerId ?? null,
      },
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
    });

    results.push({ channel, result });
  }

  return { results };
}
