/**
 * GET /invoices/:id/pdf — renders the invoice to a PDF on the server.
 * Auth + tenant scoping come from getInvoice (RLS). Node runtime is required
 * for @react-pdf/renderer.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { getInvoice } from "@/server/queries/invoices";
import { InvoicePdf } from "@/components/invoice/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getInvoice(id);
  if (!data) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await renderToBuffer(<InvoicePdf data={data} />);
  const filename = `${data.invoice.invoice_number.replace(/[\\/]/g, "-")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
