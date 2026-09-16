export type InvoiceMoveType =
  | "out_invoice"
  | "out_refund"
  | "in_invoice"
  | "in_refund"
  | string;

export type InvoiceLineInput = {
  description: string;
  quantity?: number;
  price_unit?: number;
  rate: number;
  base?: number;
  untaxed?: number;
  tax?: number;
  exempt?: number;
  total?: number;
  tax_code?: string;
  concept_id?: string | null;
};

export type NormalizedInvoiceLine = {
  description: string;
  quantity: number;
  price_unit: number;
  rate: number;
  untaxed: number;
  tax: number;
  exempt: number;
  total: number;
  concept_id: string | null;
};

export type InvoiceTotals = {
  untaxed: number;
  tax: number;
  exempt: number;
  total: number;
  retainedIva: number;
  retainedIslr: number;
  igtf: number;
  residual: number;
  withholdingPct: number;
};

export type InvoiceCreateInput = {
  partnerId: string;
  moveType: InvoiceMoveType;
  invoiceDate: string;
  registrationDate: string;
  invoiceNumber: string;
  controlNumber: string;
  currencyCode: string;
  exchangeRate: number | null;
  sinCred: boolean;
  importPlanilla: string;
  importFileNumber: string;
  amountUntaxed: number;
  taxRate: number;
  amountExempt: number;
  withholdingPct: number;
  igtfRate: number;
  lines: InvoiceLineInput[];
};
