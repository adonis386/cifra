"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

export function CancelInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onCancel() {
    if (pending) return;
    if (!window.confirm("¿Anular esta factura?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/invoices/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: invoiceId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setError(data.error || "No se pudo anular.");
          return;
        }
        router.refresh();
      } catch {
        setError("Error de red al anular.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        className="text-[var(--color-destructive)]"
        onClick={onCancel}
      >
        {pending ? "Anulando…" : "Anular"}
      </Button>
      {error ? (
        <span className="max-w-[10rem] text-right text-xs text-[var(--color-destructive)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
