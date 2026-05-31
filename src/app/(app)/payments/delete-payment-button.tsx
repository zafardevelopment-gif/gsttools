"use client";

import { ConfirmDelete } from "@/components/confirm-delete";
import { deletePaymentAction } from "@/server/actions/payments";

export function DeletePaymentButton({ id }: { id: string }) {
  return (
    <ConfirmDelete
      title="Delete payment?"
      description="Party balance and invoice status will update."
      onConfirm={() => deletePaymentAction(id)}
    />
  );
}
