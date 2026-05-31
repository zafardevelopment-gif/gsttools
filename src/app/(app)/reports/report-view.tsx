"use client";

import * as XLSX from "xlsx";
import { Download, Printer } from "lucide-react";
import { formatINR, paiseToRupees } from "@/lib/money";
import type { ReportColumn, ReportResult } from "@/server/queries/reports";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function cell(col: ReportColumn, value: string | number) {
  if (col.numeric) return formatINR(Number(value));
  return String(value ?? "");
}

export function ReportView({ report }: { report: ReportResult }) {
  function exportExcel() {
    const header = report.columns.map((c) => c.label);
    const body = report.rows.map((r) =>
      report.columns.map((c) =>
        c.numeric ? paiseToRupees(Number(r[c.key] ?? 0)) : (r[c.key] ?? ""),
      ),
    );
    const footer = report.totals
      ? report.columns.map((c, i) =>
          report.totals && c.key in report.totals
            ? paiseToRupees(report.totals[c.key])
            : i === 0
              ? "TOTAL"
              : "",
        )
      : null;

    const aoa = footer ? [header, ...body, footer] : [header, ...body];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, report.title.slice(0, 28));
    XLSX.writeFile(wb, `${report.title.replace(/\s+/g, "_")}.xlsx`);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between print:hidden">
        <h2 className="text-lg font-semibold">{report.title}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="size-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print / PDF
          </Button>
        </div>
      </div>
      <h2 className="mb-2 hidden text-lg font-semibold print:block">{report.title}</h2>

      <div className="rounded-lg border print:border-0">
        <Table>
          <TableHeader>
            <TableRow>
              {report.columns.map((c) => (
                <TableHead key={c.key} className={c.numeric ? "text-right" : ""}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={report.columns.length} className="text-center text-muted-foreground">
                  No data for this period.
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((r, i) => (
                <TableRow key={i}>
                  {report.columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={c.numeric ? "text-right tabular-nums" : "capitalize"}
                    >
                      {cell(c, r[c.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
          {report.totals && report.rows.length > 0 && (
            <TableFooter>
              <TableRow>
                {report.columns.map((c, i) => (
                  <TableCell key={c.key} className={c.numeric ? "text-right tabular-nums" : ""}>
                    {report.totals && c.key in report.totals
                      ? formatINR(report.totals[c.key])
                      : i === 0
                        ? "Total"
                        : ""}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
