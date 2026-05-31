/**
 * Server-side PDF document for an invoice, built with @react-pdf/renderer
 * primitives (NOT HTML). Rendered to a buffer in the /invoices/[id]/pdf route.
 *
 * We render "Rs " instead of the ₹ glyph because the built-in Helvetica font
 * lacks the rupee symbol; this keeps the PDF correct without bundling a font.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { formatINR } from "@/lib/money";
import { STATE_CODE_TO_NAME } from "@/lib/constants";
import type { FullInvoice } from "@/server/queries/invoices";

const money = (paise: number) => `Rs ${formatINR(paise, { withSymbol: false })}`;

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: "#18181b", fontFamily: "Helvetica" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#71717a" },
  hr: { borderBottomWidth: 1, borderBottomColor: "#e4e4e7", marginVertical: 8 },
  section: { marginTop: 8 },
  th: {
    flexDirection: "row",
    backgroundColor: "#f4f4f5",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e4e4e7",
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
  },
  td: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#f4f4f5",
    paddingVertical: 4,
  },
  cIdx: { width: "6%", paddingHorizontal: 3 },
  cName: { width: "34%", paddingHorizontal: 3 },
  cHsn: { width: "14%", paddingHorizontal: 3 },
  cQty: { width: "12%", paddingHorizontal: 3, textAlign: "right" },
  cRate: { width: "16%", paddingHorizontal: 3, textAlign: "right" },
  cAmt: { width: "18%", paddingHorizontal: 3, textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#18181b",
    paddingTop: 3,
    marginTop: 3,
    fontFamily: "Helvetica-Bold",
  },
});

export function InvoicePdf({ data }: { data: FullInvoice }) {
  const { invoice, items, party, tenant } = data;
  const isGst = invoice.invoice_type === "gst";
  const interstate = invoice.is_interstate;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.between}>
          <View>
            <Text style={s.h1}>{tenant.name}</Text>
            {tenant.address_line1 ? <Text>{tenant.address_line1}</Text> : null}
            <Text>
              {[tenant.city, tenant.state, tenant.pincode].filter(Boolean).join(", ")}
            </Text>
            {tenant.gstin ? <Text>GSTIN: {tenant.gstin}</Text> : null}
            {tenant.phone ? <Text>Ph: {tenant.phone}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h2}>
              {invoice.direction === "purchase" ? "PURCHASE BILL" : "TAX INVOICE"}
            </Text>
            <Text style={s.bold}>{invoice.invoice_number}</Text>
            <Text>Date: {invoice.invoice_date}</Text>
            {invoice.due_date ? <Text>Due: {invoice.due_date}</Text> : null}
          </View>
        </View>

        <View style={s.hr} />

        {/* Party */}
        <View style={s.between}>
          <View style={{ width: "60%" }}>
            <Text style={s.muted}>
              {invoice.direction === "purchase" ? "Supplier" : "Bill to"}
            </Text>
            {party ? (
              <>
                <Text style={s.bold}>{party.name}</Text>
                {party.billing_address ? <Text>{party.billing_address}</Text> : null}
                {party.gstin ? <Text>GSTIN: {party.gstin}</Text> : null}
                {party.phone ? <Text>Ph: {party.phone}</Text> : null}
              </>
            ) : (
              <Text style={s.muted}>Cash / walk-in</Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {invoice.place_of_supply_state ? (
              <Text>
                Place of supply:{" "}
                {STATE_CODE_TO_NAME[invoice.place_of_supply_state] ??
                  invoice.place_of_supply_state}
              </Text>
            ) : null}
            <Text style={s.muted}>{isGst ? "GST Invoice" : "Non-GST"}</Text>
          </View>
        </View>

        {/* Items */}
        <View style={[s.th, s.section]}>
          <Text style={s.cIdx}>#</Text>
          <Text style={s.cName}>Item</Text>
          <Text style={s.cHsn}>{isGst ? "HSN/SAC" : ""}</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cRate}>Rate</Text>
          <Text style={s.cAmt}>Amount</Text>
        </View>
        {items.map((it, i) => (
          <View key={it.id} style={s.td}>
            <Text style={s.cIdx}>{i + 1}</Text>
            <Text style={s.cName}>{it.name}</Text>
            <Text style={s.cHsn}>{isGst ? it.hsn_sac ?? "-" : ""}</Text>
            <Text style={s.cQty}>{it.qty} {it.unit}</Text>
            <Text style={s.cRate}>{money(it.rate_paise)}</Text>
            <Text style={s.cAmt}>{money(it.amount_paise)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totals}>
          <TotalRow label="Taxable value" value={money(invoice.taxable_value_paise)} />
          {invoice.discount_paise > 0 ? (
            <TotalRow label="Discount" value={`- ${money(invoice.discount_paise)}`} />
          ) : null}
          {isGst && interstate ? (
            <TotalRow label="IGST" value={money(invoice.igst_paise)} />
          ) : null}
          {isGst && !interstate ? (
            <>
              <TotalRow label="CGST" value={money(invoice.cgst_paise)} />
              <TotalRow label="SGST" value={money(invoice.sgst_paise)} />
            </>
          ) : null}
          {invoice.additional_charges_paise > 0 ? (
            <TotalRow label="Additional charges" value={money(invoice.additional_charges_paise)} />
          ) : null}
          {invoice.round_off_paise !== 0 ? (
            <TotalRow label="Round off" value={money(invoice.round_off_paise)} />
          ) : null}
          <View style={s.grand}>
            <Text>Total</Text>
            <Text>{money(invoice.total_paise)}</Text>
          </View>
          {invoice.amount_paid_paise > 0 ? (
            <>
              <TotalRow label="Paid" value={money(invoice.amount_paid_paise)} />
              <TotalRow
                label="Balance due"
                value={money(invoice.total_paise - invoice.amount_paid_paise)}
              />
            </>
          ) : null}
        </View>

        {invoice.notes ? (
          <View style={s.section}>
            <Text style={s.muted}>Notes: {invoice.notes}</Text>
          </View>
        ) : null}
        {invoice.terms ? (
          <Text style={s.muted}>Terms: {invoice.terms}</Text>
        ) : null}
      </Page>
    </Document>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.totalRow}>
      <Text style={{ color: "#71717a" }}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}
