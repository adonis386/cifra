import { round2 } from "@/domain/money";

export type InvoiceEntryAccounts = {
  partnerAccount: string;
  incomeExpense: string;
  taxAccount: string | null;
};

export type JournalLineDraft = {
  account_id: string;
  partner_id?: string | null;
  name: string;
  debit: number;
  credit: number;
  amount_residual: number;
};

export class InvoiceEntryDomainService {
  /** Partida doble de factura: CxC/CxP vs ingreso/gasto + IVA. */
  buildLines(input: {
    isSale: boolean;
    invoiceNumber: string;
    partnerId: string;
    untaxed: number;
    tax: number;
    exempt: number;
    total: number;
    retainedIva: number;
    accounts: InvoiceEntryAccounts;
  }): JournalLineDraft[] {
    const lines: JournalLineDraft[] = [];
    const residualBase = this.residualAfterIva(input.total, input.retainedIva);
    const { partnerAccount, incomeExpense, taxAccount } = input.accounts;

    if (input.isSale) {
      lines.push({
        account_id: partnerAccount,
        partner_id: input.partnerId,
        name: `Factura ${input.invoiceNumber}`,
        debit: Math.max(input.total, 0),
        credit: Math.max(-input.total, 0),
        amount_residual: residualBase,
      });
      lines.push({
        account_id: incomeExpense,
        partner_id: input.partnerId,
        name: "Ingresos",
        debit: Math.max(-(input.untaxed + input.exempt), 0),
        credit: Math.max(input.untaxed + input.exempt, 0),
        amount_residual: 0,
      });
      if (input.tax !== 0 && taxAccount) {
        lines.push({
          account_id: taxAccount,
          name: "IVA débito",
          debit: Math.max(-input.tax, 0),
          credit: Math.max(input.tax, 0),
          amount_residual: 0,
        });
      }
    } else {
      lines.push({
        account_id: incomeExpense,
        partner_id: input.partnerId,
        name: "Compra / gasto",
        debit: Math.max(input.untaxed + input.exempt, 0),
        credit: Math.max(-(input.untaxed + input.exempt), 0),
        amount_residual: 0,
      });
      if (input.tax !== 0 && taxAccount) {
        lines.push({
          account_id: taxAccount,
          name: "IVA crédito",
          debit: Math.max(input.tax, 0),
          credit: Math.max(-input.tax, 0),
          amount_residual: 0,
        });
      }
      lines.push({
        account_id: partnerAccount,
        partner_id: input.partnerId,
        name: `Factura ${input.invoiceNumber}`,
        debit: Math.max(-input.total, 0),
        credit: Math.max(input.total, 0),
        amount_residual: residualBase,
      });
    }
    return lines;
  }

  residualAfterIva(total: number, retainedIva: number) {
    return Math.abs(
      Math.abs(Number(total || 0)) - Math.abs(Number(retainedIva || 0)),
    );
  }

  isBalanced(lines: JournalLineDraft[]) {
    const debit = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
    const credit = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
    return Math.abs(debit - credit) < 0.015;
  }

  paymentState(residual: number, total: number): string {
    if (residual <= 0.009) return "paid";
    if (residual < total - 0.009) return "partial";
    return "not_paid";
  }
}

export const invoiceEntryDomain = new InvoiceEntryDomainService();

export function nextJournalCode(existing: string[], prefix: string) {
  const used = new Set(existing.map((c) => c.toUpperCase()));
  if (!used.has(prefix)) return prefix;
  for (let i = 2; i < 100; i++) {
    const code = `${prefix}${i}`;
    if (!used.has(code)) return code;
  }
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

export function nextAccountCode(existing: string[], parent: string) {
  const used = new Set(existing);
  for (let i = 1; i < 100; i++) {
    const code = `${parent}.${String(i).padStart(2, "0")}`;
    if (!used.has(code)) return code;
  }
  return `${parent}.${Date.now().toString().slice(-3)}`;
}
