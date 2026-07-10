"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePreferencesAction } from "@/server/actions/settings";
import {
  PAPER_SIZE_KEYS,
  PAPER_SIZE_LABELS,
  NOTIFICATION_CHANNELS,
  type PaperSizeKey,
  type NotificationChannel,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PreferencesForm({
  initialPaper,
  initialChannel,
  initialStoreEnabled,
  initialStoreSlug,
}: {
  initialPaper: string;
  initialChannel: string;
  initialStoreEnabled: boolean;
  initialStoreSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [storeEnabled, setStoreEnabled] = useState(initialStoreEnabled);
  const [storeSlug, setStoreSlug] = useState(initialStoreSlug);
  const [paper, setPaper] = useState<PaperSizeKey>(
    (PAPER_SIZE_KEYS as readonly string[]).includes(initialPaper)
      ? (initialPaper as PaperSizeKey)
      : "A4",
  );
  const [channel, setChannel] = useState<NotificationChannel>(
    (NOTIFICATION_CHANNELS as readonly string[]).includes(initialChannel)
      ? (initialChannel as NotificationChannel)
      : "whatsapp",
  );

  function save() {
    startTransition(async () => {
      const res = await updatePreferencesAction({
        paper,
        notificationChannel: channel,
        storeEnabled,
        storeSlug,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Preferences saved.");
        router.refresh();
      }
    });
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Invoice & notification preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Print paper size</Label>
            <Select value={paper} onValueChange={(v) => setPaper(v as PaperSizeKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPER_SIZE_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>{PAPER_SIZE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Default size for invoice PDFs; per-invoice override via ?paper=A5 on the PDF link.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Notification channel</Label>
            <Select
              value={channel}
              onValueChange={(v) => setChannel(v as NotificationChannel)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp (default)</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Invoice auto-share, reminders and campaigns route through this channel.
            </p>
          </div>
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={storeEnabled}
              onChange={(e) => setStoreEnabled(e.target.checked)}
            />
            Online store enable karen
          </label>
          {storeEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="store_slug">Store link</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">/store/</span>
                <Input
                  id="store_slug"
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value)}
                  placeholder="sharma-traders"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Customers is link par catalog dekh kar order de sakte hain.
              </p>
            </div>
          )}
        </div>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}
