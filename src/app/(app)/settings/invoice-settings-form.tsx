"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import {
  updateInvoiceSettingsAction,
  updateCustomUnitsAction,
} from "@/server/actions/settings-extra";
import { INVOICE_THEMES, UNITS, type InvoiceThemeKey } from "@/lib/constants";
import type { InvoiceSettings } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TOGGLES: { key: keyof InvoiceSettings; label: string; hint?: string }[] = [
  { key: "show_party_balance", label: "Show party balance in invoice", hint: "Customer ka total baaki bill par dikhega" },
  { key: "show_phone", label: "Show phone number on invoice" },
  { key: "show_time", label: "Show time on invoices" },
  { key: "show_payment_qr", label: "Show payment QR (UPI)", hint: "Business settings me UPI ID set karein" },
  { key: "receiver_signature", label: "Receiver's signature field on invoice" },
];

export function InvoiceSettingsForm({
  settings,
  customUnits,
}: {
  settings: InvoiceSettings;
  customUnits: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState<InvoiceThemeKey>(
    (settings.default_theme as InvoiceThemeKey) in INVOICE_THEMES
      ? (settings.default_theme as InvoiceThemeKey)
      : "classic",
  );
  const [toggles, setToggles] = useState<InvoiceSettings>({
    show_party_balance: settings.show_party_balance ?? false,
    show_phone: settings.show_phone ?? true,
    show_time: settings.show_time ?? false,
    show_payment_qr: settings.show_payment_qr ?? false,
    receiver_signature: settings.receiver_signature ?? false,
  });
  const [units, setUnits] = useState<string[]>(customUnits);
  const [newUnit, setNewUnit] = useState("");

  function save() {
    startTransition(async () => {
      const res = await updateInvoiceSettingsAction({
        default_theme: theme,
        ...toggles,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Invoice settings saved.");
        refreshWithRetry(router);
      }
    });
  }

  function saveUnits(next: string[]) {
    setUnits(next);
    startTransition(async () => {
      const res = await updateCustomUnitsAction(next);
      if (res.error) toast.error(res.error);
      else refreshWithRetry(router);
    });
  }

  function addUnit() {
    const u = newUnit.trim().toUpperCase();
    if (!u) return;
    if (!/^[A-Z0-9./-]{1,12}$/.test(u)) {
      return void toast.error("Unit me sirf letters/numbers (max 12).");
    }
    if ((UNITS as readonly string[]).includes(u) || units.includes(u)) {
      return void toast.info("Ye unit pehle se list me hai.");
    }
    setNewUnit("");
    saveUnits([...units, u]);
  }

  return (
    <>
      {/* Theme gallery */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Invoice themes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(INVOICE_THEMES) as InvoiceThemeKey[]).map((k) => {
              const t = INVOICE_THEMES[k];
              const active = theme === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTheme(k)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    active ? "border-primary shadow-md" : "border-border hover:border-primary/40"
                  }`}
                >
                  {/* Mini invoice preview */}
                  <div className="overflow-hidden rounded-md border bg-white">
                    <div
                      className="h-3"
                      style={{ backgroundColor: t.headerBand ? t.accent : "#fff" }}
                    />
                    <div className="space-y-1 p-2">
                      <div className="h-1.5 w-2/3 rounded" style={{ backgroundColor: t.accent }} />
                      <div className="h-1 w-full rounded bg-zinc-200" />
                      <div className="h-1 w-full rounded bg-zinc-100" />
                      <div
                        className="ml-auto h-1.5 w-1/3 rounded"
                        style={{ backgroundColor: t.accent }}
                      />
                    </div>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: t.accent }}
                    />
                    {t.label}
                    {active && <Badge className="ml-auto px-1.5 py-0">Default</Badge>}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Ye default theme hai — har invoice banate waqt change bhi kar sakte hain.
          </p>
        </CardContent>
      </Card>

      {/* Display toggles */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Theme settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={!!toggles[t.key]}
                onChange={(e) =>
                  setToggles((prev) => ({ ...prev, [t.key]: e.target.checked }))
                }
              />
              <span>
                {t.label}
                {t.hint && (
                  <span className="block text-xs text-muted-foreground">{t.hint}</span>
                )}
              </span>
            </label>
          ))}
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save invoice settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Custom units */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Item units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Built-in units ({(UNITS as readonly string[]).slice(0, 8).join(", ")}…) ke saath
            apne units add karein — jaise QUINTAL, BORI, GADDI.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {units.map((u) => (
              <Badge key={u} variant="secondary" className="gap-1 pr-1">
                {u}
                <button
                  type="button"
                  onClick={() => saveUnits(units.filter((x) => x !== u))}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                  title="Remove"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            {units.length === 0 && (
              <span className="text-xs text-muted-foreground">Koi custom unit nahi.</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUnit();
                }
              }}
              placeholder="QUINTAL"
              className="w-40 uppercase"
            />
            <Button type="button" variant="outline" onClick={addUnit} disabled={pending}>
              <Plus className="size-4" /> Add unit
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
