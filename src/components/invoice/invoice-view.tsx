import { formatINR } from "@/lib/money";
import { STATE_CODE_TO_NAME } from "@/lib/constants";
import type { FullInvoice } from "@/server/queries/invoices";

/**
 * Presentational, print-friendly invoice. Pure (no client hooks) so it renders
 * on the server and inside the print route. Tailwind `print:` utilities keep it
 * clean on paper.
 */
export function InvoiceView({ data }: { data: FullInvoice }) {
  const { invoice, items, party, tenant } = data;
  const isGst = invoice.invoice_type === "gst";
  const interstate = invoice.is_interstate;
  const balanceDue = invoice.total_paise - invoice.amount_paid_paise;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-zinc-900 print:p-0">
      {/* Header */}
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold">{tenant.name}</h1>
          {tenant.address_line1 && <p>{tenant.address_line1}</p>}
          {(tenant.city || tenant.state || tenant.pincode) && (
            <p>
              {[tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(", ")}
            </p>
          )}
          {tenant.gstin && <p>GSTIN: {tenant.gstin}</p>}
          {tenant.phone && <p>Ph: {tenant.phone}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">
            {invoice.direction === "purchase" ? "PURCHASE BILL" : "TAX INVOICE"}
          </h2>
          <p className="font-medium">{invoice.invoice_number}</p>
          <p>Date: {invoice.invoice_date}</p>
          {invoice.due_date && <p>Due: {invoice.due_date}</p>}
        </div>
      </div>

      {/* Party */}
      <div className="grid grid-cols-2 gap-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">
            {invoice.direction === "purchase" ? "Supplier" : "Bill to"}
          </p>
          {party ? (
            <>
              <p className="font-medium">{party.name}</p>
              {party.billing_address && <p>{party.billing_address}</p>}
              {party.gstin && <p>GSTIN: {party.gstin}</p>}
              {party.phone && <p>Ph: {party.phone}</p>}
            </>
          ) : (
            <p className="text-zinc-500">Cash / walk-in</p>
          )}
        </div>
        <div className="text-right">
          {invoice.place_of_supply_state && (
            <p>
              <span className="text-zinc-500">Place of supply: </span>
              {STATE_CODE_TO_NAME[invoice.place_of_supply_state] ??
                invoice.place_of_supply_state}
            </p>
          )}
          <p className="text-zinc-500">{isGst ? "GST Invoice" : "Non-GST"}</p>
        </div>
      </div>

      {/* Items */}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-y bg-zinc-50 text-xs uppercase text-zinc-600">
            <th className="p-2">#</th>
            <th className="p-2">Item</th>
            {isGst && <th className="p-2">HSN/SAC</th>}
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Rate</th>
            {isGst && <th className="p-2 text-right">GST%</th>}
            <th className="p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} className="border-b">
              <td className="p-2">{i + 1}</td>
              <td className="p-2">{it.name}</td>
              {isGst && <td className="p-2">{it.hsn_sac ?? "—"}</td>}
              <td className="p-2 text-right tabular-nums">
                {it.qty} {it.unit}
              </td>
              <td className="p-2 text-right tabular-nums">{formatINR(it.rate_paise)}</td>
              {isGst && <td className="p-2 text-right tabular-nums">{it.tax_rate}%</td>}
              <td className="p-2 text-right tabular-nums">{formatINR(it.amount_paise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1">
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
          <div className="flex justify-between border-t pt-1 font-bold">
            <span>Total</span>
            <span>{formatINR(invoice.total_paise)}</span>
          </div>
          {invoice.amount_paid_paise > 0 && (
            <>
              <Row label="Paid" value={formatINR(invoice.amount_paid_paise)} />
              <Row label="Balance due" value={formatINR(balanceDue)} />
            </>
          )}
        </div>
      </div>

      {(invoice.notes || invoice.terms) && (
        <div className="mt-6 space-y-2 border-t pt-4 text-xs text-zinc-600">
          {invoice.notes && <p><span className="font-semibold">Notes: </span>{invoice.notes}</p>}
          {invoice.terms && <p><span className="font-semibold">Terms: </span>{invoice.terms}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
