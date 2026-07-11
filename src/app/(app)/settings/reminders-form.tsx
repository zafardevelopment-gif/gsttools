"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  updateInvoiceSettingsAction,
  addReminderRuleAction,
  toggleReminderRuleAction,
  deleteReminderRuleAction,
} from "@/server/actions/settings-extra";
import type { InvoiceSettings, ReminderRuleRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ruleLabel(offset: number): string {
  if (offset < 0) return `Due date se ${-offset} din pehle`;
  if (offset === 0) return "Due date par";
  return `Due date ke ${offset} din baad (overdue)`;
}

export function RemindersForm({
  settings,
  rules,
}: {
  settings: InvoiceSettings;
  rules: ReminderRuleRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [autoShare, setAutoShare] = useState(settings.auto_share ?? true);
  const [ownerSummary, setOwnerSummary] = useState(settings.owner_daily_summary ?? false);
  const [offset, setOffset] = useState("7");

  function saveToggles(patch: InvoiceSettings) {
    startTransition(async () => {
      const res = await updateInvoiceSettingsAction(patch);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function addRule() {
    const n = Math.round(Number(offset));
    if (!Number.isFinite(n)) return void toast.error("Din ki sankhya likhen.");
    startTransition(async () => {
      const res = await addReminderRuleAction(n);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Reminder rule added.");
        router.refresh();
      }
    });
  }

  function toggleRule(id: string, enabled: boolean) {
    startTransition(async () => {
      const res = await toggleReminderRuleAction({ id, enabled });
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function removeRule(id: string) {
    startTransition(async () => {
      const res = await deleteReminderRuleAction(id);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">WhatsApp automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={autoShare}
              onChange={(e) => {
                setAutoShare(e.target.checked);
                saveToggles({ auto_share: e.target.checked });
              }}
            />
            <span>
              Send billing WhatsApp to party
              <span className="block text-xs text-muted-foreground">
                Har naye invoice par customer ko PDF link auto-send hoga
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={ownerSummary}
              onChange={(e) => {
                setOwnerSummary(e.target.checked);
                saveToggles({ owner_daily_summary: e.target.checked });
              }}
            />
            <span>
              Daily business summary on WhatsApp (to you)
              <span className="block text-xs text-muted-foreground">
                Roz scheduler chalne par aapke business number par din ka summary aayega
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Payment reminder rules (to party)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Unpaid invoices ke customers ko in rules ke hisaab se WhatsApp reminder jaata
            hai (daily scheduler se). Negative = due date se pehle.
          </p>
          {rules.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Koi rule nahi. Neeche se add karein — jaise 7 (due ke 7 din baad).
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <label className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={r.enabled}
                      onChange={(e) => toggleRule(r.id, e.target.checked)}
                    />
                    <span className={r.enabled ? "" : "text-muted-foreground line-through"}>
                      {ruleLabel(r.offset_days)}
                    </span>
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    onClick={() => removeRule(r.id)}
                    disabled={pending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule_offset">Days (− = pehle, + = baad)</Label>
              <Input
                id="rule_offset"
                type="number"
                min="-90"
                max="90"
                className="w-32"
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
              />
            </div>
            <Button onClick={addRule} disabled={pending}>
              <Plus className="size-4" /> Add rule
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
