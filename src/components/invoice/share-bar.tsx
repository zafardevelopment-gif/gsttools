"use client";

import { toast } from "sonner";
import { FileText, MessageCircle, Mail, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** wa.me needs digits with country code, no '+'. Default +91 for 10-digit. */
function waNumber(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function ShareBar({
  pdfUrl,
  invoiceNumber,
  totalLabel,
  businessName,
  partyPhone,
  partyEmail,
}: {
  pdfUrl: string;
  invoiceNumber: string;
  totalLabel: string;
  businessName: string;
  partyPhone?: string | null;
  partyEmail?: string | null;
}) {
  // The server-built URL can say "localhost" when NEXT_PUBLIC_SITE_URL isn't
  // set on the host, so: render a RELATIVE href (the browser resolves it), and
  // build absolute links from window.location at click time.
  const pdfPath = pdfUrl.startsWith("http") ? new URL(pdfUrl).pathname : pdfUrl;

  const absolutePdfUrl = () =>
    new URL(pdfPath, window.location.origin).toString();

  const message = () =>
    `Hello, here is invoice ${invoiceNumber} from ${businessName}. Amount: ${totalLabel}. View/Download: ${absolutePdfUrl()}`;

  function openWhatsapp() {
    const wa = waNumber(partyPhone);
    window.open(
      `https://wa.me/${wa}?text=${encodeURIComponent(message())}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openEmail() {
    window.location.href = `mailto:${partyEmail ?? ""}?subject=${encodeURIComponent(
      `Invoice ${invoiceNumber} from ${businessName}`,
    )}&body=${encodeURIComponent(message())}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absolutePdfUrl());
      toast.success("Invoice link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={pdfPath} target="_blank" rel="noopener noreferrer">
          <FileText className="size-4" /> PDF / Print
        </a>
      </Button>
      <Button size="sm" variant="outline" onClick={openWhatsapp}>
        <MessageCircle className="size-4" /> WhatsApp
      </Button>
      <Button size="sm" variant="outline" onClick={openEmail}>
        <Mail className="size-4" /> Email
      </Button>
      <Button size="sm" variant="outline" onClick={copyLink}>
        <Link2 className="size-4" /> Copy link
      </Button>
    </div>
  );
}
