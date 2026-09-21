"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { registerPayment, type ActionState } from "@/lib/actions/accounting";
import { Button, Dialog, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";
import {
  amountEnteredForCurrency,
  defaultPaymentMethod,
  normalizePaymentCurrency,
  normalizePaymentMethod,
  PAYMENT_METHODS,
  paymentMethodOf,
  pickLiquidityJournalId,
  resolvePaymentPostedAmount,
  type PaymentCurrency,
  type PaymentMethodId,
} from "@/domain/accounting/payment.service";

type Partner = { id: string; name: string; rif: string };
type Journal = { id: string; name: string; code: string; journal_type: string };
type InvoiceOption = {
  id: string;
  label: string;
  partnerId: string;
  residual: number;
  rate?: number;
};

const initial: ActionState = {};

function money(n: number) {
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function PaymentForm({
  partners,
  journals,
  invoices,
  defaultType = "inbound",
  initialRate = 0,
  defaultPartnerId = "",
  defaultInvoiceId = "",
  defaultAmount = "",
  defaultCurrency = "VES",
  defaultMethod,
  paymentId,
  defaultJournalId = "",
  defaultReference = "",
  defaultMemo = "",
  defaultDate,
  autoOpen = false,
  returnTo,
  buttonLabel = "Registrar cobro o pago",
}: {
  partners: Partner[];
  journals: Journal[];
  invoices: InvoiceOption[];
  defaultType?: "inbound" | "outbound";
  initialRate?: number;
  defaultPartnerId?: string;
  defaultInvoiceId?: string;
  defaultAmount?: string;
  defaultCurrency?: PaymentCurrency;
  defaultMethod?: PaymentMethodId;
  paymentId?: string;
  defaultJournalId?: string;
  defaultReference?: string;
  defaultMemo?: string;
  defaultDate?: string;
  autoOpen?: boolean;
  returnTo?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [state, action, pending] = useActionState(registerPayment, initial);
  const [paymentType, setPaymentType] = useState<"inbound" | "outbound">(defaultType);
  const [partnerId, setPartnerId] = useState(
    defaultPartnerId || partners[0]?.id || "",
  );
  const [invoiceId, setInvoiceId] = useState(defaultInvoiceId);
  const [amount, setAmount] = useState(defaultAmount);
  const [currency, setCurrency] = useState<PaymentCurrency>(
    normalizePaymentCurrency(defaultCurrency),
  );
  const [method, setMethod] = useState<PaymentMethodId>(
    defaultMethod || defaultPaymentMethod(normalizePaymentCurrency(defaultCurrency)),
  );
  const [rate, setRate] = useState(initialRate > 0 ? String(initialRate) : "");
  const today = new Date().toISOString().slice(0, 10);
  const rateNum = Number(rate || 0);
  const methodMeta = paymentMethodOf(method);
  const bankJournals = journals.filter((j) =>
    ["bank", "cash"].includes(j.journal_type),
  );
  const [journalId, setJournalId] = useState(
    defaultJournalId || pickLiquidityJournalId(bankJournals, method),
  );
  const preview = resolvePaymentPostedAmount({
    amount: Number(amount || 0),
    currency,
    exchangeRate: rateNum,
  });

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!state.success) return;
    const t = window.setTimeout(() => {
      setOpen(false);
      if (returnTo) router.push(returnTo);
    }, 800);
    return () => window.clearTimeout(t);
  }, [state.success, returnTo, router]);

  const filteredInvoices = useMemo(
    () => invoices.filter((i) => i.partnerId === partnerId),
    [invoices, partnerId],
  );

  function fillAmount(nextCurrency: PaymentCurrency, nextRate: number, invoice?: InvoiceOption) {
    const target = invoice || invoices.find((inv) => inv.id === invoiceId);
    if (!target) return;
    const useRate = nextRate > 0 ? nextRate : target.rate || 0;
    setAmount(amountEnteredForCurrency(target.residual, nextCurrency, useRate));
  }

  function applyCurrency(next: PaymentCurrency) {
    const n = Number(amount || 0);
    if (n > 0 && rateNum > 0 && next !== currency) {
      const posted = resolvePaymentPostedAmount({
        amount: n,
        currency,
        exchangeRate: rateNum,
      });
      if (posted.ok) {
        setAmount(
          next === "USD"
            ? (posted.amountUsd ?? 0).toFixed(2)
            : posted.amountBs.toFixed(2),
        );
      }
    } else {
      fillAmount(next, rateNum);
    }
    setCurrency(next);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar cobro o pago"
        description={
          paymentId
            ? "Edita el borrador y confírmalo para volver a aplicar el saldo."
            : "Puedes partir una factura en varios cobros: divisas, Zelle, transferencia, pago móvil, débito o crédito."
        }
        wide
      >
        {!partners.length ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Primero registra un cliente o proveedor.
          </p>
        ) : (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {paymentId ? <input type="hidden" name="payment_id" value={paymentId} /> : null}
      <div>
        <Label htmlFor="payment_type">Tipo</Label>
        <Select
          id="payment_type"
          name="payment_type"
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as "inbound" | "outbound")}
        >
          <option value="inbound">Cobro</option>
          <option value="outbound">Pago</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="partner_id">Cliente / proveedor</Label>
        <Select
          id="partner_id"
          name="partner_id"
          required
          value={partnerId}
          onChange={(e) => {
            const next = e.target.value;
            setPartnerId(next);
            const still = invoices.find(
              (inv) => inv.id === invoiceId && inv.partnerId === next,
            );
            if (!still) {
              setInvoiceId("");
              setAmount("");
            }
          }}
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
        <Input id="payment_date" name="payment_date" type="date" required defaultValue={defaultDate || today} />
      </div>
      <div>
        <Label htmlFor="payment_method">Medio</Label>
        <Select
          id="payment_method"
          name="payment_method"
          value={method}
          onChange={(e) => {
            const next = normalizePaymentMethod(e.target.value);
            const meta = paymentMethodOf(next);
            setMethod(next);
            setJournalId(pickLiquidityJournalId(bankJournals, next, journalId));
            if (meta.currency !== currency) applyCurrency(meta.currency);
          }}
        >
          {PAYMENT_METHODS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="currency_code">Moneda del cobro</Label>
        <Select
          id="currency_code"
          name="currency_code"
          value={currency}
          onChange={(e) => applyCurrency(normalizePaymentCurrency(e.target.value))}
        >
          <option value="VES">Bolívares (Bs)</option>
          <option value="USD">Dólares (USD)</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="amount">{currency === "USD" ? "Monto (USD)" : "Monto (Bs)"}</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          className="font-mono"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {preview.ok ? (
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {currency === "USD"
              ? `Equivale a ${money(preview.amountBs)} Bs a la tasa indicada.`
              : preview.amountUsd != null
                ? `Equivale a $ ${money(preview.amountUsd)}.`
                : "Puedes cobrar solo una parte y registrar el resto en otro medio."}
          </p>
        ) : currency === "USD" && !(rateNum > 0) ? (
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Indica la tasa Bs/USD para ver el equivalente en bolívares.
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Puedes cobrar solo una parte y registrar el resto en otro medio.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="exchange_rate">Tasa Bs/USD{currency === "USD" ? "" : " (opcional)"}</Label>
        <Input
          id="exchange_rate"
          name="exchange_rate"
          type="number"
          step="0.0001"
          min="0"
          required={currency === "USD"}
          className="font-mono"
          placeholder="Para dual $ / Bs"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="journal_id">Caja / banco</Label>
        <Select
          id="journal_id"
          name="journal_id"
          value={journalId}
          onChange={(e) => setJournalId(e.target.value)}
        >
          {bankJournals.map((j) => (
            <option key={j.id} value={j.id}>
              {j.code} — {j.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="invoice_id">Factura (opcional)</Label>
        <Select
          id="invoice_id"
          name="invoice_id"
          value={invoiceId}
          onChange={(e) => {
            const next = e.target.value;
            setInvoiceId(next);
            const match = invoices.find((inv) => inv.id === next);
            if (match) fillAmount(currency, rateNum, match);
          }}
        >
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
        <Input
          id="reference"
          name="reference"
          placeholder={methodMeta.referencePlaceholder}
          defaultValue={defaultReference}
        />
      </div>
      <div>
        <Label htmlFor="memo">Memo</Label>
        <Input id="memo" name="memo" defaultValue={defaultMemo} />
      </div>
      <div className="sm:col-span-2">
        <FieldError message={state.error} />
        {state.success && (
          <p className="mb-2 text-sm text-[var(--color-accent)]">{state.success}</p>
        )}
        {paymentId ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="draft" disabled={pending} variant="secondary">
              {pending ? "Guardando…" : "Guardar borrador"}
            </Button>
            <Button type="submit" name="intent" value="confirm" disabled={pending}>
              {pending ? "Confirmando…" : "Confirmar cobro"}
            </Button>
          </div>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? "Registrando…" : "Registrar"}
          </Button>
        )}
      </div>
    </form>
        )}
      </Dialog>
    </>
  );
}
