/**
 * GET /invoices/:id/pdf — renders the invoice to a PDF on the server.
 * Auth + tenant scoping come from getInvoice (RLS). Node runtime is required
 * for @react-pdf/renderer.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { getInvoice } from "@/server/queries/invoices";
import {
  InvoicePdf,
  PAPER_SIZES,
  type PaperSizeKey,
} from "@/components/invoice/invoice-pdf";
import { getInvoiceRenderExtras } from "@/server/invoice-extras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getInvoice(id);
  if (!data) {
    return new Response("Not found", { status: 404 });
  }

  // Paper size: ?paper=A5 overrides the tenant's print settings default.
  const url = new URL(req.url);
  const printSettings = (data.tenant.print_settings ?? {}) as { paper?: string };
  const requested = url.searchParams.get("paper") ?? printSettings.paper ?? "A4";
  const paper: PaperSizeKey = requested in PAPER_SIZES ? (requested as PaperSizeKey) : "A4";

  const extras = await getInvoiceRenderExtras(data);
  const buffer = await renderToBuffer(
    <InvoicePdf data={data} paper={paper} extras={extras} />,
  );
  const filename = `${data.invoice.invoice_number.replace(/[\\/]/g, "-")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
