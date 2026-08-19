"use client";

import { useActionState } from "react";
import {
  updateInvoiceIvaRetention,
  type ActionState,
} from "@/lib/actions/invoices";
import { Button, FieldError, Input } from "@/components/ui";

const initial: ActionState = {};

export function EditIvaRetentionForm({
  invoiceId,
  amountTax,
  currentRetained,
}: {
  invoiceId: string;
  amountTax: number;
  currentRetained: number;
}) {
  const [state, action, pending] = useActionState(
    updateInvoiceIvaRetention,
    initial,
  );
  const defaultPct =
    amountTax > 0 && currentRetained > 0
      ? String(Number(((currentRetained / amountTax) * 100).toFixed(2)))
      : "75";

  if (amountTax <= 0) {
    return (
      <span className="text-xs text-[var(--color-muted-foreground)]">Sin IVA</span>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="flex items-center gap-1">
        <Input
          name="withholding_pct"
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          defaultValue={defaultPct}
          className="w-16 px-2 py-1.5 text-right text-xs"
          aria-label="% retención IVA"
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">%</span>
        <Button type="submit" variant="ghost" disabled={pending} className="px-2 py-1.5 text-xs">
          {pending ? "…" : "Aplicar"}
        </Button>
      </div>
      <FieldError message={state.error} />
      {state.success ? (
        <span className="max-w-[12rem] text-right text-[11px] text-[var(--color-accent)]">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}
