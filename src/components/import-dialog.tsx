"use client";

import { refreshWithRetry } from "@/lib/refresh-with-retry";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import type { ImportResult } from "@/server/actions/import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Generic CSV bulk-import dialog: template download + file upload → server
 * action. Used by both Items and Parties pages.
 */
export function ImportDialog({
  entityLabel,
  templateCsv,
  templateFilename,
  action,
}: {
  entityLabel: string;
  templateCsv: string;
  templateFilename: string;
  action: (csvText: string) => Promise<ImportResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function downloadTemplate() {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return void toast.error("Pehle CSV file chunein.");
    startTransition(async () => {
      const text = await file.text();
      const res = await action(text);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setResult(res);
      toast.success(`${res.imported ?? 0} ${entityLabel} import ho gaye.`);
      refreshWithRetry(router);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setResult(null);
          setFile(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk import {entityLabel}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p>
              ✅ <span className="font-semibold">{result.imported}</span> imported
              {result.skipped?.length ? (
                <>
                  , <span className="font-semibold">{result.skipped.length}</span> skipped
                </>
              ) : null}
            </p>
            {result.skipped && result.skipped.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
                {result.skipped.map((s, i) => (
                  <p key={i} className="text-muted-foreground">
                    Row {s.row}: {s.reason}
                  </p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="rounded-md border border-dashed p-3 text-sm">
              <p className="mb-2 text-muted-foreground">
                1. Template download karen, Excel me bharein, phir{" "}
                <span className="font-medium">CSV</span> format me save karke upload karen.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="size-3.5" /> Download template
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csv_file">CSV file</Label>
              <Input
                id="csv_file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || !file}>
                {pending ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
