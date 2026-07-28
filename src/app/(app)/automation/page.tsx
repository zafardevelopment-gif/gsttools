import {
  KeyRound,
  Webhook,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { requireRouteAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/server/queries/app-context";
import {
  AutomationToggle,
  ApiKeyList,
  ActivityLog,
  WebhookList,
  DeliveryLog,
} from "./automation-client";

export const metadata = { title: "Automation · AI Munim" };
export const dynamic = "force-dynamic";

/** Small count pill sitting inside a tab label. */
function TabCount({ n }: { n: number }) {
  return (
    <span className="ml-0.5 rounded-full bg-foreground/10 px-1.5 py-px text-[11px] font-semibold tabular-nums">
      {n}
    </span>
  );
}

/**
 * Automation — API keys, and the log of everything n8n (or any workflow) has
 * pushed in.
 *
 * The Activity Log is the reason this screen is one click from the sidebar
 * rather than buried in Settings: when a customer says "message nahi gaya" or
 * "bill do baar ban gaya", this is the page that answers it.
 */
export default async function AutomationPage() {
  await requireRouteAccess("/automation");
  const ctx = await getAppContext();
  const supabase = await createClient();

  const enabled = ctx.activeTenant?.automation_enabled ?? false;

  // Only owners/admins can see keys (RLS enforces it; this just avoids an
  // empty-looking table for everyone else).
  const [{ data: keys }, { data: activity }, { data: hooks }, { data: deliveries }] =
    await Promise.all([
      supabase
        .from("aimunim_automation_api_keys")
        .select("id, label, key_prefix, scopes, last_used_at, revoked_at, created_at")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("aimunim_automation_ingest_log")
        .select("id, endpoint, status, idempotency_key, entity_type, entity_id, error, created_at")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("aimunim_automation_webhooks")
        .select("id, label, target_url, secret, events, is_active, consecutive_failures, last_success_at")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false }),
      // Joined so the log can say "payment.received → n8n production" rather
      // than showing two opaque uuids.
      supabase
        .from("aimunim_automation_deliveries")
        .select(
          "id, attempt, status, response_code, error, created_at, aimunim_automation_events(event_type), aimunim_automation_webhooks(label)",
        )
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  type DeliveryJoin = {
    id: string;
    attempt: number;
    status: "pending" | "succeeded" | "failed";
    response_code: number | null;
    error: string | null;
    created_at: string;
    aimunim_automation_events?: { event_type: string } | null;
    aimunim_automation_webhooks?: { label: string } | null;
  };

  const deliveryRows = ((deliveries ?? []) as unknown as DeliveryJoin[]).map((d) => ({
    id: d.id,
    attempt: d.attempt,
    status: d.status,
    response_code: d.response_code,
    error: d.error,
    created_at: d.created_at,
    event_type: d.aimunim_automation_events?.event_type ?? null,
    webhook_label: d.aimunim_automation_webhooks?.label ?? null,
  }));

  const canManage = ctx.role === "owner" || ctx.role === "admin";

  // Counts on the tabs: the owner can see at a glance whether anything has
  // actually gone out, without opening each tab to find an empty table.
  const keyCount = (keys ?? []).filter((k) => !k.revoked_at).length;
  const hookCount = (hooks ?? []).filter((h) => h.is_active).length;
  const activityCount = (activity ?? []).length;
  const deliveryCount = deliveryRows.length;

  return (
    <div>
      <PageHeader
        title="Automation"
        description="Apne workflows se seedha AI Munim me bills, parties aur payments bhejein."
      />

      <AutomationToggle enabled={enabled} canManage={canManage} />

      {enabled && (
        <Tabs defaultValue="keys" className="mt-6">
          {/*
            Deliberately NOT w-full: the base style is `w-fit`, so letting the
            list hug its labels renders a proper segmented control. Stretching
            it edge-to-edge (with flex-1 triggers) flattens it into a single
            grey strip that reads as a divider, not as tabs.
          */}
          <TabsList className="mb-5 h-9 max-w-full overflow-x-auto [&>*]:shrink-0 [&>*]:px-3">
            <TabsTrigger value="keys">
              <KeyRound /> API Keys
              {keyCount > 0 && <TabCount n={keyCount} />}
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Webhook /> Webhooks
              {hookCount > 0 && <TabCount n={hookCount} />}
            </TabsTrigger>
            <TabsTrigger value="activity">
              <ArrowDownToLine /> Andar aaya
              {activityCount > 0 && <TabCount n={activityCount} />}
            </TabsTrigger>
            <TabsTrigger value="outbound">
              <ArrowUpFromLine /> Bahar gaya
              {deliveryCount > 0 && <TabCount n={deliveryCount} />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="keys">
            <ApiKeyList keys={keys ?? []} canManage={canManage} />
          </TabsContent>

          <TabsContent value="webhooks">
            <WebhookList hooks={hooks ?? []} canManage={canManage} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityLog rows={activity ?? []} />
          </TabsContent>

          <TabsContent value="outbound">
            <DeliveryLog rows={deliveryRows} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
