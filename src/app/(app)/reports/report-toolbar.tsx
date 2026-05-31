"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const REPORT_TYPES = [
  { key: "sales", label: "Sales" },
  { key: "purchase", label: "Purchase" },
  { key: "outstanding", label: "Outstanding" },
  { key: "stock", label: "Stock" },
  { key: "expense", label: "Expense" },
] as const;

const NEEDS_DATES = new Set(["sales", "purchase", "expense"]);

export function ReportToolbar({
  type,
  from,
  to,
}: {
  type: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [t, setT] = useState(type);
  const [f, setF] = useState(from);
  const [to2, setTo2] = useState(to);

  function apply(nextType = t) {
    const sp = new URLSearchParams(params.toString());
    sp.set("type", nextType);
    sp.set("from", f);
    sp.set("to", to2);
    router.push(`/reports?${sp.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
      <div className="space-y-1.5">
        <Label>Report</Label>
        <Select
          value={t}
          onValueChange={(v) => {
            setT(v);
            apply(v);
          }}
        >
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {REPORT_TYPES.map((r) => (
              <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {NEEDS_DATES.has(t) && (
        <>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={f} onChange={(e) => setF(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to2} onChange={(e) => setTo2(e.target.value)} />
          </div>
          <Button onClick={() => apply()}>Apply</Button>
        </>
      )}
    </div>
  );
}
