"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { code128Widths, code128TotalModules } from "@/lib/barcode";
import { formatINR } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LabelItem = {
  name: string;
  sku: string | null;
  barcode: string | null;
  sale_price_paise: number;
  mrp_paise: number;
  unit: string;
};

/** Label sizes in mm — common thermal label rolls in India. */
const LABEL_SIZES = {
  "38x25": { label: "38 × 25 mm (small)", w: 38, h: 25 },
  "50x25": { label: "50 × 25 mm (standard)", w: 50, h: 25 },
  "75x40": { label: "75 × 40 mm (medium)", w: 75, h: 40 },
  "100x50": { label: "100 × 50 mm (large)", w: 100, h: 50 },
} as const;

type SizeKey = keyof typeof LABEL_SIZES;

type Options = {
  showBusiness: boolean;
  showName: boolean;
  showMrp: boolean;
  showPrice: boolean;
  showSku: boolean;
  showBarcodeText: boolean;
};

function BarcodeSvg({ value, heightMm }: { value: string; heightMm: number }) {
  const widths = useMemo(() => code128Widths(value), [value]);
  if (!widths) {
    return <p className="text-[8px] text-red-600">Invalid barcode text</p>;
  }
  const total = code128TotalModules(widths);
  const bars: React.ReactNode[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) {
      bars.push(<rect key={i} x={x} y={0} width={w} height={10} fill="#000" />);
    }
    x += w;
  });
  return (
    <svg
      viewBox={`0 0 ${total} 10`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: `${heightMm}mm`, display: "block" }}
    >
      {bars}
    </svg>
  );
}

export function LabelClient({
  item,
  businessName,
}: {
  item: LabelItem;
  businessName: string;
}) {
  const [size, setSize] = useState<SizeKey>("50x25");
  const [copies, setCopies] = useState("1");
  const [opts, setOpts] = useState<Options>({
    showBusiness: true,
    showName: true,
    showMrp: item.mrp_paise > 0,
    showPrice: true,
    showSku: false,
    showBarcodeText: true,
  });

  const dims = LABEL_SIZES[size];
  const barcodeValue = item.barcode?.trim() || item.sku?.trim() || "";
  const count = Math.min(Math.max(Number(copies) || 1, 1), 100);
  const big = dims.h >= 40; // larger labels get bigger type

  const toggles: { key: keyof Options; label: string }[] = [
    { key: "showBusiness", label: "Business name" },
    { key: "showName", label: "Item name" },
    { key: "showMrp", label: "MRP" },
    { key: "showPrice", label: "Sale price" },
    { key: "showSku", label: "SKU" },
    { key: "showBarcodeText", label: "Barcode number" },
  ];

  const labelBody = (
    <div
      className="label-body"
      style={{
        width: `${dims.w}mm`,
        height: `${dims.h}mm`,
        padding: "1.5mm",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        border: "1px dashed #d4d4d8",
        color: "#000",
        backgroundColor: "#fff",
      }}
    >
      <div style={{ textAlign: "center", lineHeight: 1.15 }}>
        {opts.showBusiness && (
          <div style={{ fontSize: big ? "3.2mm" : "2.2mm", fontWeight: 700 }}>
            {businessName}
          </div>
        )}
        {opts.showName && (
          <div
            style={{
              fontSize: big ? "3.5mm" : "2.5mm",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </div>
        )}
        {opts.showSku && item.sku && (
          <div style={{ fontSize: big ? "2.8mm" : "2mm" }}>SKU: {item.sku}</div>
        )}
      </div>

      {barcodeValue ? (
        <div>
          <BarcodeSvg value={barcodeValue} heightMm={big ? 12 : 7} />
          {opts.showBarcodeText && (
            <div
              style={{
                textAlign: "center",
                fontSize: big ? "2.8mm" : "2mm",
                letterSpacing: "0.5mm",
              }}
            >
              {barcodeValue}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: "center", fontSize: "2mm", color: "#999" }}>
          (No barcode/SKU set on this item)
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: big ? "3.2mm" : "2.4mm",
          fontWeight: 700,
        }}
      >
        {opts.showMrp && item.mrp_paise > 0 ? (
          <span>MRP {formatINR(item.mrp_paise)}</span>
        ) : (
          <span />
        )}
        {opts.showPrice ? <span>{formatINR(item.sale_price_paise)}</span> : <span />}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Print CSS: one label per page at the exact roll size. */}
      <style>{`
        @media print {
          @page { size: ${dims.w}mm ${dims.h}mm; margin: 0; }
          body * { visibility: hidden; }
          .label-sheet, .label-sheet * { visibility: visible; }
          .label-sheet { position: absolute; left: 0; top: 0; }
          .label-body { border: none !important; page-break-after: always; }
        }
      `}</style>

      {/* Options panel */}
      <Card className="w-full lg:w-80 print:hidden">
        <CardContent className="space-y-4 pt-5">
          <div className="space-y-1.5">
            <Label>Label size</Label>
            <Select value={size} onValueChange={(v) => setSize(v as SizeKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(LABEL_SIZES) as SizeKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{LABEL_SIZES[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="copies">Copies</Label>
            <Input
              id="copies"
              type="number"
              min="1"
              max="100"
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Show on label</Label>
            {toggles.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={opts[t.key]}
                  onChange={(e) =>
                    setOpts((prev) => ({ ...prev, [t.key]: e.target.checked }))
                  }
                />
                {t.label}
              </label>
            ))}
          </div>

          <Button className="w-full" onClick={() => window.print()}>
            <Printer className="size-4" /> Print {count} label{count > 1 ? "s" : ""}
          </Button>
          <p className="text-xs text-muted-foreground">
            Printer settings me paper size {dims.w}×{dims.h}mm select karen
            (label/thermal printer roll ke hisaab se).
          </p>
        </CardContent>
      </Card>

      {/* Preview + print sheet */}
      <div className="flex-1">
        <p className="mb-2 text-sm font-medium text-muted-foreground print:hidden">
          Preview
        </p>
        <div className="label-sheet flex flex-wrap gap-2">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i}>{labelBody}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
