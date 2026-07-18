"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send } from "lucide-react";
import { createCampaignAction, sendCampaignAction } from "@/server/actions/marketing";
import type { CampaignRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function NewCampaignDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [audience, setAudience] = useState<"all" | "customers" | "suppliers">("customers");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCampaignAction({
        name: String(fd.get("name") ?? ""),
        channel,
        template: String(fd.get("template") ?? ""),
        body: String(fd.get("body") ?? ""),
        audience,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Campaign saved as draft.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cp_name">Campaign name</Label>
            <Input id="cp_name" name="name" placeholder="Diwali Sale 2026" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS (dormant)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customers">Customers</SelectItem>
                  <SelectItem value="suppliers">Suppliers</SelectItem>
                  <SelectItem value="all">All parties</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp_template">WhatsApp template name (optional)</Label>
            <Input id="cp_template" name="template" placeholder="festival_offer_v1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp_body">Message</Label>
            <Textarea
              id="cp_body"
              name="body"
              rows={4}
              placeholder="Namaste {name}! Is festive season par 20% ki chhoot…"
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  sent: "default",
  draft: "secondary",
  sending: "secondary",
  failed: "destructive",
};

export function CampaignList({ campaigns }: { campaigns: CampaignRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function send(id: string) {
    startTransition(async () => {
      const res = await sendCampaignAction(id);
      if (res.error) toast.error(res.error);
      else toast.success(`Campaign sent to ${res.sent ?? 0} parties.`);
      refreshWithRetry(router);
    });
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No campaigns yet. Create your first WhatsApp campaign.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {campaigns.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex flex-col gap-2 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {c.channel} · {c.audience}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"} className="capitalize">
                {c.status}
                {c.status === "sent" ? ` (${c.sent_count})` : ""}
              </Badge>
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">{c.body}</p>
            {c.status === "draft" && (
              <div>
                <Button size="sm" onClick={() => send(c.id)} disabled={pending}>
                  <Send className="size-3.5" /> Send now
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
