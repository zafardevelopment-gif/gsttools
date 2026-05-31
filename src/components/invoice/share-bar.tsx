"use client";

import Link from "next/link";
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
  const message = `Hello, here is invoice ${invoiceNumber} from ${businessName}. Amount: ${totalLabel}. View/Download: ${pdfUrl}`;

  const wa = waNumber(partyPhone);
  const whatsappHref = `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
  const mailtoHref = `mailto:${partyEmail ?? ""}?subject=${encodeURIComponent(
    `Invoice ${invoiceNumber} from ${businessName}`,
  )}&body=${encodeURIComponent(message)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pdfUrl);
      toast.success("Invoice link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
          <FileText className="size-4" /> PDF / Print
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href={whatsappHref} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4" /> WhatsApp
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={mailtoHref}>
          <Mail className="size-4" /> Email
        </a>
      </Button>
      <Button size="sm" variant="outline" onClick={copyLink}>
        <Link2 className="size-4" /> Copy link
      </Button>
    </div>
  );
}
