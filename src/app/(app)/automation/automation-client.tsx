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
} from "lucide-react";
import { refreshWithRetry } from "@/lib/refresh-with-retry";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  setAutomationEnabledAction,
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
      else if (res.key) {
        setSecret(res.key);
        refreshWithRetry(router);
      }
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
      setSecret(null);
      setCopied(false);
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

const STATUS_LABEL: Record<ActivityRow["status"], string> = {
  succeeded: "Ho gaya",
  failed: "Fail",
  pending: "Chal raha hai",
};

const STATUS_VARIANT: Record<ActivityRow["status"], "default" | "secondary" | "destructive"> = {
  succeeded: "default",
  failed: "destructive",
  pending: "secondary",
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
