import { round2, round4, toUsd } from "@/domain/money";
import { seniatIvaAmount, seniatIvaWithheld, ivaFromTaxAndBase } from "@/domain/seniat/iva";
import type {
  InvoiceCreateInput,
  InvoiceLineInput,
  InvoiceMoveType,
  InvoiceTotals,
  NormalizedInvoiceLine,
} from "@/domain/invoices/invoice.types";

export class InvoiceDomainService {
  moveMeta(moveType: InvoiceMoveType) {
    if (moveType === "out_invoice") return { operation: "V" as const, doc: "01" };
    if (moveType === "out_refund") return { operation: "V" as const, doc: "03" };
    if (moveType === "in_invoice") return { operation: "C" as const, doc: "01" };
    if (moveType === "in_refund") return { operation: "C" as const, doc: "03" };
    return { operation: "C" as const, doc: "01" };
  }

  docType(moveType: InvoiceMoveType, importPlanilla: string, importFileNumber: string) {
    const meta = this.moveMeta(moveType);
    if (importPlanilla || importFileNumber) return { ...meta, doc: "04" };
    return meta;
  }

  validateCreate(input: InvoiceCreateInput): string | null {
    if (!input.partnerId || !input.invoiceDate || !input.invoiceNumber) {
      return "Completa tercero, fecha y número de factura.";
    }
    if (!input.controlNumber && String(input.moveType).startsWith("in_") && !input.sinCred) {
      return "El número de control es obligatorio en compras (crédito fiscal).";
    }
    if (input.currencyCode === "USD" && !(input.exchangeRate && input.exchangeRate > 0)) {
      return "Con moneda USD indica la tasa del día (Bs por 1 USD).";
    }
    return null;
  }

  vesFactor(currencyCode: string, exchangeRate: number | null) {
    return currencyCode === "USD" && exchangeRate && exchangeRate > 0 ? exchangeRate : 1;
  }

  fallbackLines(
    lines: InvoiceLineInput[],
    amountUntaxed: number,
    amountExempt: number,
    taxRate: number,
  ): InvoiceLineInput[] {
    if (lines.length) return lines;
    const amountTax = seniatIvaAmount(amountUntaxed, taxRate);
    return [
      {
        description: "Línea principal",
        quantity: 1,
        price_unit: amountUntaxed || amountExempt,
        rate: taxRate,
        untaxed: amountUntaxed,
        tax: amountTax,
        exempt: amountExempt,
        base: amountUntaxed || amountExempt,
      },
    ];
  }

  normalizeLines(
    lines: InvoiceLineInput[],
    factor: number,
  ): NormalizedInvoiceLine[] {
    return lines.map((l) => {
      const quantity = Number(l.quantity ?? 1) || 0;
      let priceUnit = Number(
        l.price_unit ??
          (quantity ? Number(l.base || 0) / quantity : Number(l.base || 0)),
      );
      if (factor !== 1) {
        priceUnit = round4(priceUnit * factor);
      }
      const rate = Number(l.rate || 0);
      const gross = round2(quantity * priceUnit);
      const hasExplicit = l.untaxed != null || l.tax != null || l.exempt != null;
      let untaxed = hasExplicit ? Number(l.untaxed || 0) : rate > 0 ? gross : 0;
      let tax = hasExplicit
        ? Number(l.tax || 0)
        : round2((untaxed * rate) / 100);
      let exempt = hasExplicit ? Number(l.exempt || 0) : rate > 0 ? 0 : gross;
      if (factor !== 1 && hasExplicit) {
        untaxed = round2(untaxed * factor);
        tax = round2(tax * factor);
        exempt = round2(exempt * factor);
      }
      return {
        description: l.description || "Línea",
        quantity,
        price_unit: priceUnit,
        rate,
        untaxed,
        tax,
        exempt,
        total: round2(untaxed + tax + exempt),
        concept_id: l.concept_id || null,
      };
    });
  }

  /** Vista: cantidad × precio × alícuota (sin factor USD). */
  lineFromQtyPriceRate(quantity: number, priceUnit: number, rate: number) {
    const base = round2(quantity * priceUnit);
    if (!(rate > 0)) {
      return {
        quantity,
        priceUnit,
        base,
        rate: 0,
        untaxed: 0,
        tax: 0,
        exempt: base,
        subtotal: base,
        isExempt: true,
      };
    }
    const tax = seniatIvaAmount(base, rate);
    return {
      quantity,
      priceUnit,
      base,
      rate,
      untaxed: base,
      tax,
      exempt: 0,
      subtotal: round2(base + tax),
      isExempt: false,
    };
  }

  sumLines(
    lines: NormalizedInvoiceLine[],
    fallbackUntaxed: number,
    fallbackTax: number,
    fallbackExempt: number,
  ) {
    const linesUntaxed = lines.reduce((s, l) => s + l.untaxed, 0);
    const linesTax = lines.reduce((s, l) => s + l.tax, 0);
    const linesExempt = lines.reduce((s, l) => s + l.exempt, 0);
    return {
      untaxed: round2(linesUntaxed || fallbackUntaxed),
      tax: round2(linesTax || fallbackTax),
      exempt: round2(linesExempt || fallbackExempt),
    };
  }

  totals(args: {
    lines: NormalizedInvoiceLine[];
    amountUntaxed: number;
    amountTax: number;
    amountExempt: number;
    withholdingPct: number;
    retainedIslr: number;
    igtfRate: number;
    factor: number;
  }): InvoiceTotals {
    const summed = this.sumLines(
      args.lines,
      args.amountUntaxed * args.factor,
      args.amountTax * args.factor,
      args.amountExempt * args.factor,
    );
    const total = round2(summed.untaxed + summed.tax + summed.exempt);
    const withholdingPct = summed.tax > 0 ? args.withholdingPct : 0;
    const retainedIva = round2((summed.tax * withholdingPct) / 100);
    const igtf =
      args.igtfRate > 0 ? round2((total * args.igtfRate) / 100) : 0;
    const residual = round2(total - retainedIva - args.retainedIslr);
    return {
      untaxed: summed.untaxed,
      tax: summed.tax,
      exempt: summed.exempt,
      total,
      retainedIva,
      retainedIslr: round2(args.retainedIslr),
      igtf,
      residual,
      withholdingPct,
    };
  }

  usdAmounts(totals: InvoiceTotals, rate: number | null) {
    return {
      untaxed: toUsd(totals.untaxed, rate),
      tax: toUsd(totals.tax, rate),
      exempt: toUsd(totals.exempt, rate),
      total: toUsd(totals.total, rate),
      residual: toUsd(totals.residual, rate),
    };
  }

  ivaRetentionOnSaved(tax: number, base: number, pct: number) {
    if (!(pct > 0) || pct > 100) {
      return { ok: false as const, error: "Indica un % de retención IVA entre 0.01 y 100 (típico 75)." };
    }
    if (tax <= 0 || base <= 0) {
      return {
        ok: false as const,
        error: "Esta factura no tiene IVA (exenta o SDCF). No aplica retención IVA.",
      };
    }
    const ali = ivaFromTaxAndBase(tax, base);
    return { ok: true as const, retained: seniatIvaWithheld(base, ali, pct) };
  }
}

export const invoiceDomain = new InvoiceDomainService();
