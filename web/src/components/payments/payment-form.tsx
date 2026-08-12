"use client";

import { useActionState, useMemo, useState } from "react";
import { registerPayment, type ActionState } from "@/lib/actions/accounting";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

type Partner = { id: string; name: string; rif: string };
type Journal = { id: string; name: string; code: string; journal_type: string };
type InvoiceOption = {
  id: string;
  label: string;
  partnerId: string;
  residual: number;
};

const initial: ActionState = {};

export function PaymentForm({
  partners,
  journals,
  invoices,
  defaultType = "inbound",
  initialRate = 0,
}: {
  partners: Partner[];
  journals: Journal[];
  invoices: InvoiceOption[];
  defaultType?: "inbound" | "outbound";
  initialRate?: number;
}) {
  const [state, action, pending] = useActionState(registerPayment, initial);
  const [paymentType, setPaymentType] = useState<"inbound" | "outbound">(defaultType);
  const [partnerId, setPartnerId] = useState(partners[0]?.id || "");
  const today = new Date().toISOString().slice(0, 10);

  const filteredInvoices = useMemo(
    () => invoices.filter((i) => i.partnerId === partnerId),
    [invoices, partnerId],
  );

  const bankJournals = journals.filter((j) =>
    ["bank", "cash"].includes(j.journal_type),
  );

  if (!partners.length) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Necesitas terceros con facturas abiertas.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <div>
        <Label htmlFor="payment_type">Tipo</Label>
        <Select
          id="payment_type"
          name="payment_type"
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as "inbound" | "outbound")}
        >
          <option value="inbound">Cobro (CxC)</option>
          <option value="outbound">Pago (CxP)</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="partner_id">Tercero</Label>
        <Select
          id="partner_id"
          name="partner_id"
          required
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.rif})
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="payment_date">Fecha</Label>
        <Input id="payment_date" name="payment_date" type="date" required defaultValue={today} />
      </div>
      <div>
        <Label htmlFor="amount">Monto (Bs)</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required defaultValue="0" />
      </div>
      <div>
        <Label htmlFor="exchange_rate">Tasa Bs/USD (opcional)</Label>
        <Input
          id="exchange_rate"
          name="exchange_rate"
          type="number"
          step="0.0001"
          min="0"
          className="font-mono"
          placeholder="Para dual $ / Bs"
          defaultValue={initialRate > 0 ? String(initialRate) : ""}
        />
      </div>
      <div>
        <Label htmlFor="journal_id">Diario</Label>
        <Select id="journal_id" name="journal_id" defaultValue={bankJournals[0]?.id || ""}>
          {bankJournals.map((j) => (
            <option key={j.id} value={j.id}>
              {j.code} — {j.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="invoice_id">Factura (opcional)</Label>
        <Select id="invoice_id" name="invoice_id" defaultValue="">
          <option value="">Aplicar a abiertas (FIFO)</option>
          {filteredInvoices.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="reference">Referencia</Label>
        <Input id="reference" name="reference" placeholder="Nº transferencia / cheque" />
      </div>
      <div>
        <Label htmlFor="memo">Memo</Label>
        <Input id="memo" name="memo" />
      </div>
      <div className="md:col-span-2">
        <FieldError message={state.error} />
        {state.success && (
          <p className="mb-2 text-sm text-[var(--color-accent)]">{state.success}</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando…" : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}
