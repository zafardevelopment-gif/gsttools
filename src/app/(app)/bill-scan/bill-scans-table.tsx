"use client";

import { format, parseISO } from "date-fns";
import { deleteBillScanAction } from "@/server/actions/bill-scan";
import { formatINR } from "@/lib/money";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BillScanWithUrl } from "@/server/queries/bill-scans";

const TYPE_LABELS: Record<string, string> = {
  purchase: "Purchase",
  expense: "Expense",
  other: "Other",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "confirmed") return <Badge variant="secondary">Confirmed</Badge>;
  if (status === "failed") return <Badge variant="destructive">Needs review</Badge>;
  return <Badge variant="outline">Pending review</Badge>;
}

export function BillScansTable({ scans }: { scans: BillScanWithUrl[] }) {
  if (scans.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Abhi koi bill scan nahi hai. &quot;Scan bill&quot; se shuru karein.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Photo</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {scans.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                {s.imageUrl ? (
                  <a href={s.imageUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.imageUrl}
                      alt="Bill"
                      className="size-10 rounded object-cover border"
                    />
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{TYPE_LABELS[s.type] ?? s.type}</TableCell>
              <TableCell>{s.vendor_name || "—"}</TableCell>
              <TableCell>{s.bill_date ? format(parseISO(s.bill_date), "dd MMM yyyy") : "—"}</TableCell>
              <TableCell className="text-right">
                {s.amount_paise != null ? formatINR(s.amount_paise) : "—"}
              </TableCell>
              <TableCell>{s.category || "—"}</TableCell>
              <TableCell><StatusBadge status={s.status} /></TableCell>
              <TableCell>
                <ConfirmDelete
                  onConfirm={() => deleteBillScanAction(s.id)}
                  title="Delete this bill scan?"
                  description="Photo aur extracted data dono delete ho jaayenge. Agar expense ban chuka hai to woh alag se rahega."
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
