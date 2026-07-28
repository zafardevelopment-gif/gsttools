"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Copy,
  Check,
  Zap,
  ShieldCheck,
  KeyRound,
  Trash2,
  ScrollText,
  Webhook,
  Send,
} from "lucide-react";
import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { AUTOMATION_EVENT_LABELS as EVENT_LABELS } from "@/lib/constants";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  setAutomationEnabledAction,
  createWebhookAction,
  deleteWebhookAction,
  reactivateWebhookAction,
  sendTestEventAction,
} from "@/server/actions/automation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <Icon className="mx-auto size-8 text-muted-foreground/60" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** Shared by the inbound ingest log and the outbound delivery log. */
type RunStatus = "pending" | "succeeded" | "failed";

const STATUS_LABEL: Record<RunStatus, string> = {
  succeeded: "Ho gaya",
  failed: "Fail",
  pending: "Chal raha hai",
};

const STATUS_VARIANT: Record<RunStatus, "default" | "secondary" | "destructive"> = {
  succeeded: "default",
  failed: "destructive",
  pending: "secondary",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Master switch
// ---------------------------------------------------------------------------

export function AutomationToggle({
  enabled,
  canManage,
}: {
  enabled: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      const res = await setAutomationEnabledAction(next);
      if (res.error) toast.error(res.error);
      else {
        toast.success(next ? "Automation on ho gaya." : "Automation band kar diya.");
        refreshWithRetry(router);
      }
    });
  }

  // Off state doubles as the explainer — a blank screen would tell the owner
  // nothing about what this feature is for.
  if (!enabled) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-primary/10 p-2">
              <Zap className="size-5 text-primary" />
            </span>
            <div>
              <p className="font-semibold">Automation abhi band hai</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                On karne par aapke workflows (jaise n8n) seedha AI Munim me bill,
                party, payment aur expense daal sakte hain — bina kisi ko login
                kiye. Har request ka record Activity Log me rehta hai.
              </p>
            </div>
          </div>
          <Button onClick={() => toggle(true)} disabled={pending || !canManage}>
            {pending ? "On kar rahe hain…" : "Automation on karein"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-primary/10 p-2">
            <ShieldCheck className="size-5 text-primary" />
          </span>
          <div>
            <p className="font-semibold">Automation chalu hai</p>
            <p className="text-sm text-muted-foreground">
              API endpoint:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                /api/v1/ingest/…
              </code>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => toggle(false)}
          disabled={pending || !canManage}
        >
          Band karein
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

type KeyRow = {
  id: string;
  label: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

/**
 * The secret is returned by the server action exactly once and never stored in
 * readable form, so this dialog is the only chance the user gets to copy it.
 * That is why it stays open until they explicitly dismiss it.
 */
function NewKeyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createApiKeyAction(String(fd.get("label") ?? ""));
      if (res.error) toast.error(res.error);
      else if (res.key) setSecret(res.key);
      // Deliberately NOT refreshing here. refreshWithRetry fires router.refresh()
      // several times over the next second or so; each RSC refresh remounts this
      // subtree and resets `secret` to null — so the one-time key would vanish
      // from under the user before they could copy it. The list is refreshed in
      // close() instead, once they have dismissed the dialog.
    });
  }

  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success("Key copy ho gayi.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy nahi hui — key ko select karke manually copy karein.");
    }
  }

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      const hadKey = secret !== null;
      setSecret(null);
      setCopied(false);
      // Pull the new key into the table only after the secret is safely gone.
      if (hadKey) refreshWithRetry(router);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Nayi key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret ? "Key ban gayi" : "Nayi API key"}</DialogTitle>
        </DialogHeader>

        {secret ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">
                Ye key sirf abhi dikhegi
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Hum isko encrypt karke rakhte hain, dobara dikha nahi sakte. Abhi
                copy karke n8n me daal dijiye. Kho jaaye to nayi bana lena — purani
                revoke kar dena.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>API key</Label>
              <div className="flex gap-2">
                <Input readOnly value={secret} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium">n8n HTTP Request node me:</p>
              <pre className="mt-1.5 overflow-x-auto text-xs text-muted-foreground">
{`Authorization: Bearer ${secret.slice(0, 18)}…
Idempotency-Key: {{ $json.id }}`}
              </pre>
            </div>

            <DialogFooter>
              <Button onClick={() => close(false)}>Copy kar liya, band karein</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="key_label">Key ka naam</Label>
              <Input
                id="key_label"
                name="label"
                placeholder="n8n production"
                required
              />
              <p className="text-xs text-muted-foreground">
                Sirf pehchaan ke liye — baad me pata chale ki kaunsi key kahan lagi hai.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Bana rahe hain…" : "Key banayein"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeyList({
  keys,
  canManage,
}: {
  keys: KeyRow[];
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <EmptyState icon={KeyRound} title="Sirf owner ya admin ke liye">
        API keys sirf business owner ya admin dekh aur bana sakte hain.
      </EmptyState>
    );
  }

  if (keys.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState icon={KeyRound} title="Abhi koi API key nahi hai">
          Ek key banayein aur n8n se apne bills, parties aur payments seedha
          AI Munim me bhejein. Key sirf ek baar dikhti hai, isliye bana kar turant
          copy kar lena.
        </EmptyState>
        <div className="flex justify-center">
          <NewKeyDialog />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewKeyDialog />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Aakhri baar use</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.label}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {k.key_prefix}…
                    </code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {k.last_used_at ? formatWhen(k.last_used_at) : "Kabhi nahi"}
                  </TableCell>
                  <TableCell>
                    {k.revoked_at ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!k.revoked_at && (
                      <ConfirmDelete
                        title={`"${k.label}" revoke karein?`}
                        description="Is key se chal rahe saare workflows turant band ho jayenge. Ye wapas nahi hoti — nayi key banani padegi."
                        confirmLabel="Revoke karein"
                        pendingLabel="Revoke ho rahi hai…"
                        successMessage="Key revoke ho gayi."
                        onConfirm={() => revokeApiKeyAction(k.id)}
                        trigger={
                          <Button size="sm" variant="ghost" className="text-destructive">
                            <Trash2 className="size-3.5" /> Revoke
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhooks (outbound)
// ---------------------------------------------------------------------------

type WebhookRow = {
  id: string;
  label: string;
  target_url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
};

function NewWebhookDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createWebhookAction({
        label: String(fd.get("label") ?? ""),
        url: String(fd.get("url") ?? ""),
        // Empty = sab events. v1 me per-event chunav nahi, kyunki zyadatar
        // workflows n8n ke andar hi filter karte hain.
        events: [],
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Webhook add ho gaya.");
        setOpen(false);
        refreshWithRetry(router);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Naya webhook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Naya webhook</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wh_label">Naam</Label>
            <Input id="wh_label" name="label" placeholder="n8n production" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh_url">n8n Webhook URL</Label>
            <Input
              id="wh_url"
              name="url"
              type="url"
              placeholder="https://n8n.aapkadomain.com/webhook/aimunim"
              required
            />
            <p className="text-xs text-muted-foreground">
              Sirf https chalega. n8n me Webhook node banayein aur uska
              Production URL yahan paste karein.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Add kar rahe hain…" : "Add karein"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WebhookList({
  hooks,
  canManage,
}: {
  hooks: WebhookRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState<string | null>(null);

  function test(id: string) {
    startTransition(async () => {
      const res = await sendTestEventAction(id);
      if (res.error) toast.error(res.error);
      else toast.success("Test event bhej diya — n8n me check karein.");
      refreshWithRetry(router);
    });
  }

  function reactivate(id: string) {
    startTransition(async () => {
      const res = await reactivateWebhookAction(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Webhook dobara chalu ho gaya.");
        refreshWithRetry(router);
      }
    });
  }

  if (!canManage) {
    return (
      <EmptyState icon={Webhook} title="Sirf owner ya admin ke liye">
        Webhooks me signing secret hota hai, isliye sirf owner ya admin dekh sakte hain.
      </EmptyState>
    );
  }

  if (hooks.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState icon={Webhook} title="Abhi koi webhook nahi hai">
          Webhook lagane par AI Munim khud aapko batayega — bill bana, payment
          aayi, stock kam hua. Tab n8n reminder ya report bhej sakta hai, bina
          baar-baar poochhe.
        </EmptyState>
        <div className="flex justify-center">
          <NewWebhookDialog />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewWebhookDialog />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {hooks.map((h) => (
          <Card key={h.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{h.label}</p>
                  <p className="truncate text-xs text-muted-foreground" title={h.target_url}>
                    {h.target_url}
                  </p>
                </div>
                {h.is_active ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="destructive">Band</Badge>
                )}
              </div>

              {!h.is_active && (
                <p className="rounded-md bg-destructive/5 p-2 text-xs text-destructive">
                  Lagatar {h.consecutive_failures} baar fail hua, isliye apne aap band
                  kar diya. n8n theek karke dobara chalu karein.
                </p>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Signing secret</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={shown === h.id ? h.secret : "•".repeat(24)}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShown(shown === h.id ? null : h.id)}
                  >
                    {shown === h.id ? "Chhupayein" : "Dikhayein"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Isse n8n me <code>X-AiMunim-Signature</code> verify karein — taaki
                  koi aur aapke workflow ko fake data na bhej sake.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => test(h.id)}>
                  <Send className="size-3.5" /> Test bhejein
                </Button>
                {!h.is_active && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => reactivate(h.id)}>
                    Dobara chalu karein
                  </Button>
                )}
                <ConfirmDelete
                  title={`"${h.label}" hatayein?`}
                  description="Is endpoint pe aage koi event nahi jayega. Purani delivery history bani rahegi."
                  confirmLabel="Hata dein"
                  pendingLabel="Hata rahe hain…"
                  successMessage="Webhook hat gaya."
                  onConfirm={() => deleteWebhookAction(h.id)}
                  trigger={
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Trash2 className="size-3.5" /> Hatayein
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outbound delivery log
// ---------------------------------------------------------------------------

type DeliveryRow = {
  id: string;
  attempt: number;
  status: "pending" | "succeeded" | "failed";
  response_code: number | null;
  error: string | null;
  created_at: string;
  event_type: string | null;
  webhook_label: string | null;
};

export function DeliveryLog({ rows }: { rows: DeliveryRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={Send} title="Abhi tak koi event bhej nahi paye">
        Jab bill banega ya payment aayegi, AI Munim aapke webhook pe event bhejega
        aur har koshish yahan dikhegi — kaunsa event, kitni baar try kiya, aur
        jawab kya mila.
      </EmptyState>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kab</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Kahan</TableHead>
              <TableHead>Koshish</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatWhen(r.created_at)}
                </TableCell>
                <TableCell className="font-medium">
                  {EVENT_LABELS[r.event_type ?? ""] ?? r.event_type ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.webhook_label ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">#{r.attempt}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>
                    {STATUS_LABEL[r.status]}
                    {r.response_code ? ` · ${r.response_code}` : ""}
                  </Badge>
                  {r.error && (
                    <p className="mt-1 max-w-xs text-xs text-destructive">{r.error}</p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

type ActivityRow = {
  id: string;
  endpoint: string;
  status: "pending" | "succeeded" | "failed";
  idempotency_key: string;
  entity_type: string | null;
  entity_id: string | null;
  error: string | null;
  created_at: string;
};

const ENDPOINT_LABEL: Record<string, string> = {
  invoice: "Bill bana",
  party: "Party judi",
  payment: "Payment aayi",
  expense: "Kharcha juda",
};

export function ActivityLog({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={ScrollText} title="Abhi tak koi request nahi aayi">
        Jab aapka workflow AI Munim me kuch bhejega, wo yahan dikhega — kya aaya,
        kab aaya, aur bana ya nahi. Jab kabhi lage ki &ldquo;entry nahi hui&rdquo;,
        sabse pehle yahi page kholna.
      </EmptyState>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kab</TableHead>
              <TableHead>Kya</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatWhen(r.created_at)}
                </TableCell>
                <TableCell className="font-medium">
                  {ENDPOINT_LABEL[r.endpoint] ?? r.endpoint}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  {r.error && (
                    <p className="mt-1 max-w-xs text-xs text-destructive">{r.error}</p>
                  )}
                </TableCell>
                <TableCell>
                  <code
                    className="font-mono text-xs text-muted-foreground"
                    title={r.idempotency_key}
                  >
                    {r.idempotency_key.slice(0, 20)}
                    {r.idempotency_key.length > 20 ? "…" : ""}
                  </code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
