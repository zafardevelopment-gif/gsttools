"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { PartyFormDialog } from "./party-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deletePartyAction } from "@/server/actions/parties";
import { formatINR } from "@/lib/money";
import { STATE_CODE_TO_NAME } from "@/lib/constants";
import type { PartyRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function balanceLabel(paise: number) {
  if (paise === 0) return <span className="text-muted-foreground">Settled</span>;
  if (paise > 0)
    return <span className="text-emerald-600">{formatINR(paise)} due</span>;
  return <span className="text-red-600">{formatINR(-paise)} payable</span>;
}

export function PartiesTable({ parties }: { parties: PartyRow[] }) {
  if (parties.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No parties yet. Click <span className="font-medium">New party</span> to add one.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>GSTIN</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {parties.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link href={`/parties/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                {p.phone && (
                  <div className="text-xs text-muted-foreground">{p.phone}</div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="capitalize">
                  {p.type}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{p.gstin ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {p.state_code ? STATE_CODE_TO_NAME[p.state_code] ?? p.state_code : "—"}
              </TableCell>
              <TableCell className="text-right">{balanceLabel(p.balance_paise)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <PartyFormDialog
                    party={p}
                    trigger={
                      <Button variant="ghost" size="icon">
                        <Pencil className="size-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                    }
                  />
                  <ConfirmDelete
                    title="Delete party?"
                    description={`"${p.name}" will be removed.`}
                    onConfirm={() => deletePartyAction(p.id)}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
