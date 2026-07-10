"use client";

import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies the party's public shared-ledger link to the clipboard. */
export function ShareLedgerButton({ shareToken }: { shareToken: string }) {
  async function copy() {
    const url = `${window.location.origin}/share/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ledger link copied — WhatsApp par bhej sakte hain.");
    } catch {
      toast.info(url);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={copy}>
      <Share2 className="size-3.5" /> Share ledger
    </Button>
  );
}
