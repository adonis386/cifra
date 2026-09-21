"use client";

import { useActionState } from "react";
import { resetPaymentToDraft, type ActionState } from "@/lib/actions/accounting";
import { Button } from "@/components/ui";

const initial: ActionState = {};

export function ResetPaymentButton({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(resetPaymentToDraft, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("¿Volver este cobro a borrador? Se reversa el asiento y el saldo de la factura.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      <Button type="submit" variant="ghost" disabled={pending} className="text-[var(--color-destructive)]">
        {pending ? "Revirtiendo…" : "Volver a borrador"}
      </Button>
      {state.error ? (
        <p className="mt-1 text-xs text-[var(--color-destructive)]">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="mt-1 text-xs text-[var(--color-accent)]">{state.success}</p>
      ) : null}
    </form>
  );
}
