import { formatINR } from "@/lib/money";
import { STATE_CODE_TO_NAME, INVOICE_THEMES, documentTitle, type InvoiceThemeKey } from "@/lib/constants";
import type { FullInvoice } from "@/server/queries/invoices";

export type ViewExtras = {
  settings?: {
    show_party_balance?: boolean;
    show_phone?: boolean;
    show_time?: boolean;
    receiver_signature?: boolean;
  };
  logoUrl?: string | null;
  signatureUrl?: string | null;
  qrDataUrl?: string | null;
};

/**
 * Presentational, print-friendly invoice. Pure (no client hooks) so it renders
 * on the server and inside the print route. Uses the invoice's selected theme
 * accent so the on-screen view matches the PDF. Tailwind `print:` utilities
 * keep it clean on paper.
 */
export function InvoiceView({
  data,
  extras = {},
}: {
  data: FullInvoice;
  extras?: ViewExtras;
}) {
  const { invoice, items, party, tenant } = data;
  const opts = extras.settings ?? {};
  const isGst = invoice.invoice_type === "gst";
  const interstate = invoice.is_interstate;
  const balanceDue = invoice.total_paise - invoice.amount_paid_paise;
  const theme =
    INVOICE_THEMES[(invoice.template as InvoiceThemeKey) in INVOICE_THEMES
      ? (invoice.template as InvoiceThemeKey)
      : "classic"];

  const isPaid = invoice.status === "paid";

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-zinc-900 print:p-0">
      {/* Header */}
      <div
        className="flex items-start justify-between border-b-2 pb-5"
        style={{ borderColor: theme.accent }}
      >
        <div className="flex items-start gap-3">
          {extras.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={extras.logoUrl}
              alt="Logo"
              className="size-14 rounded-md object-contain"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: theme.accent }}>
              {tenant.name}
            </h1>
            <div className="mt-1 space-y-0.5 text-xs leading-relaxed text-zinc-600">
              {tenant.address_line1 && <p>{tenant.address_line1}</p>}
              {(tenant.city || tenant.state || tenant.pincode) && (
                <p>
                  {[tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(", ")}
                </p>
              )}
              {tenant.gstin && (
                <p className="font-medium text-zinc-800">GSTIN: {tenant.gstin}</p>
              )}
              {tenant.phone && opts.show_phone !== false && <p>Ph: {tenant.phone}</p>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span
            className="inline-block rounded-md px-3 py-1 text-xs font-bold uppercase tracking-widest text-white"
            style={{ backgroundColor: theme.accent }}
          >
            {documentTitle(invoice.voucher_type, invoice.direction)}
          </span>
          <p className="mt-2 text-base font-bold tabular-nums">{invoice.invoice_number}</p>
          <div className="mt-1 space-y-0.5 text-xs text-zinc-600">
            <p>
              Date: {invoice.invoice_date}
              {opts.show_time ? ` ${invoice.created_at.slice(11, 16)}` : ""}
            </p>
            {invoice.due_date && <p>Due: {invoice.due_date}</p>}
            {invoice.eway_bill_no && <p>e-Way Bill: {invoice.eway_bill_no}</p>}
          </div>
          {isPaid && (
            <span className="mt-2 inline-block rounded border-2 border-green-600 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-green-600">
              Paid
            </span>
          )}
        </div>
      </div>

      {/* Party */}
      <div className="grid grid-cols-2 gap-4 py-5">
        <div className="rounded-lg bg-zinc-50 p-3 print:bg-transparent print:p-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            {invoice.direction === "purchase" ? "Supplier" : "Bill To"}
          </p>
          {party ? (
            <div className="mt-1 space-y-0.5">
              <p className="text-base font-semibold">{party.name}</p>
              {party.billing_address && (
                <p className="text-xs text-zinc-600">{party.billing_address}</p>
              )}
              {party.gstin && <p className="text-xs text-zinc-600">GSTIN: {party.gstin}</p>}
              {party.phone && <p className="text-xs text-zinc-600">Ph: {party.phone}</p>}
            </div>
          ) : (
            <p className="mt-1 font-medium text-zinc-500">Cash / walk-in</p>
          )}
        </div>
        <div className="self-center text-right text-xs text-zinc-600">
          {invoice.place_of_supply_state && (
            <p>
              <span className="text-zinc-400">Place of supply: </span>
              {STATE_CODE_TO_NAME[invoice.place_of_supply_state] ??
                invoice.place_of_supply_state}
            </p>
          )}
          <p className="mt-0.5">
            {isGst ? (interstate ? "Inter-state · IGST" : "Intra-state · CGST + SGST") : "Non-GST"}
          </p>
        </div>
      </div>

      {/* Items */}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr
            className="text-[11px] uppercase tracking-wider text-white"
            style={{ backgroundColor: theme.accent }}
          >
            <th className="rounded-l-md p-2.5 font-semibold">#</th>
            <th className="p-2.5 font-semibold">Item</th>
            {isGst && <th className="p-2.5 font-semibold">HSN/SAC</th>}
            <th className="p-2.5 text-right font-semibold">Qty</th>
            <th className="p-2.5 text-right font-semibold">Rate</th>
            {isGst && <th className="p-2.5 text-right font-semibold">GST%</th>}
            <th className="rounded-r-md p-2.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} className="border-b border-zinc-100 even:bg-zinc-50/60">
              <td className="p-2.5 text-zinc-400">{i + 1}</td>
              <td className="p-2.5 font-medium">{it.name}</td>
              {isGst && <td className="p-2.5 text-zinc-500">{it.hsn_sac ?? "—"}</td>}
              <td className="p-2.5 text-right tabular-nums">
                {it.qty} {it.unit}
              </td>
              <td className="p-2.5 text-right tabular-nums">{formatINR(it.rate_paise)}</td>
              {isGst && <td className="p-2.5 text-right tabular-nums">{it.tax_rate}%</td>}
              <td className="p-2.5 text-right font-medium tabular-nums">
                {formatINR(it.amount_paise)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-5 flex justify-end">
        <div className="w-72 space-y-1.5">
          <Row label="Taxable value" value={formatINR(invoice.taxable_value_paise)} />
          {invoice.discount_paise > 0 && (
            <Row label="Discount" value={`- ${formatINR(invoice.discount_paise)}`} />
          )}
          {isGst &&
            (interstate ? (
              <Row label="IGST" value={formatINR(invoice.igst_paise)} />
            ) : (
              <>
                <Row label="CGST" value={formatINR(invoice.cgst_paise)} />
                <Row label="SGST" value={formatINR(invoice.sgst_paise)} />
              </>
            ))}
          {invoice.additional_charges_paise > 0 && (
            <Row label="Additional charges" value={formatINR(invoice.additional_charges_paise)} />
          )}
          {invoice.round_off_paise !== 0 && (
            <Row label="Round off" value={formatINR(invoice.round_off_paise)} />
          )}
          <div
            className="flex items-center justify-between rounded-lg px-3 py-2 text-base font-bold text-white"
            style={{ backgroundColor: theme.accent }}
          >
            <span>Total</span>
            <span className="tabular-nums">{formatINR(invoice.total_paise)}</span>
          </div>
          {invoice.amount_paid_paise > 0 && (
            <>
              <Row label="Paid" value={formatINR(invoice.amount_paid_paise)} />
              <div className="flex justify-between font-semibold">
                <span>Balance due</span>
                <span className="tabular-nums">{formatINR(balanceDue)}</span>
              </div>
            </>
          )}
          {opts.show_party_balance && party && (
            <Row
              label="Party total outstanding"
              value={formatINR(Math.max(0, party.balance_paise))}
            />
          )}
        </div>
      </div>

      {/* Payment QR + signatures */}
      {(extras.qrDataUrl || extras.signatureUrl || opts.receiver_signature) && (
        <div className="mt-8 flex items-end justify-between gap-4">
          {extras.qrDataUrl ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={extras.qrDataUrl} alt="UPI QR" className="size-24" />
              <p className="mt-1 text-[10px] text-zinc-500">Scan to pay (UPI)</p>
            </div>
          ) : (
            <div />
          )}
          <div className="flex gap-10">
            {opts.receiver_signature && (
              <div className="w-36 text-center">
                <div className="h-10" />
                <div className="border-t border-zinc-300" />
                <p className="mt-1 text-[10px] text-zinc-500">Receiver&apos;s signature</p>
              </div>
            )}
            {extras.signatureUrl && (
              <div className="w-36 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={extras.signatureUrl}
                  alt="Signature"
                  className="mx-auto h-10 object-contain"
                />
                <div className="border-t border-zinc-300" />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Authorised signatory — {tenant.name}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {(invoice.notes || invoice.terms || invoice.irn) && (
        <div className="mt-8 space-y-1.5 border-t pt-4 text-xs text-zinc-500">
          {invoice.irn && (
            <p className="break-all">
              <span className="font-semibold text-zinc-700">IRN: </span>
              {invoice.irn}
            </p>
          )}
          {invoice.notes && (
            <p>
              <span className="font-semibold text-zinc-700">Notes: </span>
              {invoice.notes}
            </p>
          )}
          {invoice.terms && (
            <p>
              <span className="font-semibold text-zinc-700">Terms: </span>
              {invoice.terms}
            </p>
          )}
        </div>
      )}

      <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-zinc-300 print:text-zinc-400">
        Thank you for your business
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-3">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
