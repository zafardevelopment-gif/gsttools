import "server-only";
import QRCode from "qrcode";
import { publicEnv } from "@/lib/env";
import type { FullInvoice } from "@/server/queries/invoices";
import type { InvoiceSettings } from "@/lib/database.types";

/**
 * Render-time extras shared by the on-screen InvoiceView and the PDF:
 * resolved logo/signature URLs, the tenant's display toggles, and (when
 * enabled) a UPI payment QR as a data URL.
 */
export type InvoiceRenderExtras = {
  settings: InvoiceSettings;
  logoUrl: string | null;
  signatureUrl: string | null;
  qrDataUrl: string | null;
};

function storageUrl(path: string | null): string | null {
  if (!path) return null;
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
}

export async function getInvoiceRenderExtras(
  data: FullInvoice,
): Promise<InvoiceRenderExtras> {
  const { tenant, invoice } = data;
  const settings = (tenant.invoice_settings ?? {}) as InvoiceSettings;

  let qrDataUrl: string | null = null;
  const due = invoice.total_paise - invoice.amount_paid_paise;
  if (
    settings.show_payment_qr &&
    tenant.upi_id &&
    invoice.direction === "sale" &&
    due > 0
  ) {
    const upi = new URLSearchParams({
      pa: tenant.upi_id,
      pn: tenant.name.slice(0, 40),
      am: (due / 100).toFixed(2),
      cu: "INR",
      tn: `Inv ${invoice.invoice_number}`.slice(0, 40),
    });
    try {
      qrDataUrl = await QRCode.toDataURL(`upi://pay?${upi.toString()}`, {
        margin: 1,
        width: 240,
      });
    } catch {
      qrDataUrl = null;
    }
  }

  return {
    settings,
    logoUrl: storageUrl(tenant.logo_path),
    signatureUrl: storageUrl(tenant.signature_path),
    qrDataUrl,
  };
}
