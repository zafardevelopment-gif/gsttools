import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveContext } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tally-export?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Downloads sale/purchase invoices for the period as a Tally-importable XML
 * (Vouchers → Import Data in Tally Prime/ERP 9). Amounts are in rupees.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const rupees = (paise: number) => (paise / 100).toFixed(2);
/** Tally date format: YYYYMMDD */
const tallyDate = (d: string) => d.replaceAll("-", "");

export async function GET(req: NextRequest) {
  const { tenantId } = await requireActiveContext();
  const supabase = await createClient();

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 8) + "01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const [{ data: tenant }, { data: invoices }] = await Promise.all([
    supabase.from("aimunim_tenants").select("name").eq("id", tenantId).single(),
    supabase
      .from("aimunim_invoices")
      .select(
        "invoice_number, invoice_date, direction, voucher_type, party_id, taxable_value_paise, cgst_paise, sgst_paise, igst_paise, total_paise",
      )
      .eq("tenant_id", tenantId)
      .eq("voucher_type", "invoice")
      .neq("status", "draft")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .order("invoice_date"),
  ]);

  const partyIds = [...new Set((invoices ?? []).map((i) => i.party_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (partyIds.length) {
    const { data } = await supabase.from("aimunim_parties").select("id, name").in("id", partyIds);
    (data ?? []).forEach((p) => names.set(p.id, p.name));
  }

  const vouchers = (invoices ?? [])
    .map((inv) => {
      const isSale = inv.direction === "sale";
      const partyName = inv.party_id ? (names.get(inv.party_id) ?? "Cash") : "Cash";
      const vchType = isSale ? "Sales" : "Purchase";
      const salesLedger = isSale ? "Sales Account" : "Purchase Account";
      // Party is debited for sales (asset ↑), credited for purchases.
      const partyAmt = isSale ? -inv.total_paise : inv.total_paise;
      const revenueAmt = isSale ? inv.taxable_value_paise : -inv.taxable_value_paise;
      const taxSign = isSale ? 1 : -1;

      const taxLines: string[] = [];
      const taxLine = (ledger: string, paise: number) =>
        `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(ledger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${taxSign * paise < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${rupees(taxSign * paise)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`;
      if (inv.cgst_paise > 0) taxLines.push(taxLine("CGST", inv.cgst_paise));
      if (inv.sgst_paise > 0) taxLines.push(taxLine("SGST", inv.sgst_paise));
      if (inv.igst_paise > 0) taxLines.push(taxLine("IGST", inv.igst_paise));

      return `      <VOUCHER VCHTYPE="${vchType}" ACTION="Create">
        <DATE>${tallyDate(inv.invoice_date)}</DATE>
        <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${esc(inv.invoice_number)}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${esc(partyName)}</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(partyName)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${partyAmt < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${rupees(partyAmt)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${salesLedger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${revenueAmt < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${rupees(revenueAmt)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
${taxLines.join("\n")}
      </VOUCHER>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(tenant?.name ?? "")}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="tally-vouchers-${from}-to-${to}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
