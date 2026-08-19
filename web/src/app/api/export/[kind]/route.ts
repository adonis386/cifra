import { NextRequest } from "next/server";
import { buildXlsxBuffer, xlsxResponse, type SheetRow } from "@/lib/export/xlsx";
import {
  loadFiscalBook,
  loadInvoicesList,
  loadLedger,
  loadOpenInvoices,
  loadPartnerStatement,
  loadPayments,
  loadTrialBalance,
} from "@/lib/export/reports-data";

function cell(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  return String(v);
}

function sheetRow(obj: Record<string, unknown>): SheetRow {
  const out: SheetRow = {};
  for (const [k, v] of Object.entries(obj)) out[k] = cell(v);
  return out;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string }> },
) {
  const { kind } = await context.params;
  const q = request.nextUrl.searchParams;

  try {
    switch (kind) {
      case "receivables": {
        const data = await loadOpenInvoices("receivable");
        if (!data) return new Response("Sin empresa", { status: 400 });
        const buf = buildXlsxBuffer([
          {
            name: "CxC",
            rows: data.rows.map((r) => ({
              Cliente: r.tercero,
              RIF: r.rif,
              Factura: r.factura,
              Emisión: r.emision,
              Vence: r.vence,
              Aging: r.aging,
              Estado: r.estado,
              Total_Bs: r.total,
              Saldo_Bs: r.saldo,
              Tasa: r.tasa,
            })),
          },
        ]);
        return xlsxResponse(`cifra-cxc-${data.today}.xlsx`, buf);
      }
      case "payables": {
        const data = await loadOpenInvoices("payable");
        if (!data) return new Response("Sin empresa", { status: 400 });
        const buf = buildXlsxBuffer([
          {
            name: "CxP",
            rows: data.rows.map((r) => ({
              Proveedor: r.tercero,
              RIF: r.rif,
              Factura: r.factura,
              Emisión: r.emision,
              Vence: r.vence,
              Aging: r.aging,
              Estado: r.estado,
              Total_Bs: r.total,
              Saldo_Bs: r.saldo,
              Tasa: r.tasa,
            })),
          },
        ]);
        return xlsxResponse(`cifra-cxp-${data.today}.xlsx`, buf);
      }
      case "statements": {
        const partnerId = q.get("partner") || "";
        const from = q.get("from") || "";
        const to = q.get("to") || "";
        if (!partnerId || !from || !to) {
          return new Response("Faltan partner/from/to", { status: 400 });
        }
        const data = await loadPartnerStatement({ partnerId, from, to });
        if (!data) return new Response("No encontrado", { status: 404 });
        const buf = buildXlsxBuffer([
          {
            name: "Estado de cuenta",
            rows: data.rows.map((r) => ({
              Fecha: r.fecha,
              Documento: r.documento,
              Detalle: r.detalle,
              Cargo: r.cargo,
              Abono: r.abono,
              Saldo: r.saldo,
            })),
          },
        ]);
        return xlsxResponse(
          `cifra-edo-cuenta-${data.partner.rif}-${from}_${to}.xlsx`,
          buf,
        );
      }
      case "ledger": {
        const accountId = q.get("account") || "";
        const from = q.get("from") || "";
        const to = q.get("to") || "";
        if (!accountId || !from || !to) {
          return new Response("Faltan account/from/to", { status: 400 });
        }
        const data = await loadLedger({ accountId, from, to });
        if (!data) return new Response("No encontrado", { status: 404 });
        const buf = buildXlsxBuffer([
          {
            name: "Mayor",
            rows: data.rows.map((r) => ({
              Fecha: r.fecha,
              Asiento: r.asiento,
              Detalle: r.detalle,
              Tercero: r.tercero,
              Debe: r.debe,
              Haber: r.haber,
              Saldo: r.saldo,
            })),
          },
        ]);
        return xlsxResponse(
          `cifra-mayor-${data.account.code}-${from}_${to}.xlsx`,
          buf,
        );
      }
      case "trial-balance": {
        const data = await loadTrialBalance();
        if (!data) return new Response("Sin empresa", { status: 400 });
        const buf = buildXlsxBuffer([
          {
            name: "Balance",
            rows: data.rows.map((r) => ({
              Código: r.codigo,
              Cuenta: r.cuenta,
              Debe: r.debe,
              Haber: r.haber,
              Saldo: r.saldo,
            })),
          },
        ]);
        const today = new Date().toISOString().slice(0, 10);
        return xlsxResponse(`cifra-balance-${today}.xlsx`, buf);
      }
      case "invoices": {
        const data = await loadInvoicesList();
        if (!data) return new Response("Sin empresa", { status: 400 });
        const buf = buildXlsxBuffer([
          {
            name: "Facturas",
            rows: data.rows.map((r) => ({
              Fecha: r.fecha,
              Tipo: r.tipo,
              Tercero: r.tercero,
              RIF: r.rif,
              Factura: r.factura,
              Control: r.control,
              Base: r.base,
              IVA: r.iva,
              Total: r.total,
              Ret_IVA: r.ret_iva,
              Residual: r.residual,
              Estado: r.estado,
              Moneda: r.moneda,
              Tasa: r.tasa,
            })),
          },
        ]);
        const today = new Date().toISOString().slice(0, 10);
        return xlsxResponse(`cifra-facturas-${today}.xlsx`, buf);
      }
      case "book": {
        const id = q.get("id") || "";
        if (!id) return new Response("Falta id", { status: 400 });
        const data = await loadFiscalBook(id);
        if (!data) return new Response("No encontrado", { status: 404 });
        const isSale = data.book.book_type === "sale";
        const sheetName = isSale ? "Libro ventas Art76" : "Libro compras Art75";
        const rawRows = data.rows as Array<Record<string, unknown>>;
        const buf = buildXlsxBuffer([
          {
            name: sheetName,
            rows: isSale
              ? rawRows.map((r) => sheetRow({
                  "N° Operacion": r.nro_op,
                  "Fecha Emision": r.fecha_emision,
                  "Tipo Doc.": r.tipo_doc,
                  "N° Documento": r.documento,
                  "N° Nota Débito": r.nota_debito,
                  "N° Nota Crédito": r.nota_credito,
                  "Factura Afectada": r.factura_afectada,
                  "Serial Maq. Fiscal": r.serial_maq_fiscal,
                  "Numero Z": r.numero_z,
                  "Razón Social": r.razon_social,
                  RIF: r.rif,
                  "Expediente Exportación": r.exp_exportacion,
                  "Total Ventas + Impuesto": r.total_con_iva,
                  "Exoneradas / No sujetas": r.exoneradas,
                  "Total Exportación": r.total_exportacion,
                  "Ventas Exentas": r.ventas_exentas,
                  "CO Base 16%": r.co_base_16,
                  "CO (%) 16": r.co_pct_16,
                  "CO Impuesto 16%": r.co_imp_16,
                  "CO Base 8%": r.co_base_8,
                  "CO (%) 8": r.co_pct_8,
                  "CO Impuesto 8%": r.co_imp_8,
                  "CO Base 31%": r.co_base_31,
                  "CO (%) 31": r.co_pct_31,
                  "CO Impuesto 31%": r.co_imp_31,
                  "NO Base Imponible": r.no_base,
                  "Venta exenta": r.venta_exenta,
                  "NO (%)": r.no_pct,
                  "NO Impuesto": r.no_impuesto,
                  "NO Base 8%": r.no_base_8,
                  "NO (%) 8": r.no_pct_8,
                  "NO Impuesto 8%": r.no_imp_8,
                  "NO Base 31%": r.no_base_31,
                  "NO (%) 31": r.no_pct_31,
                  "NO Impuesto 31%": r.no_imp_31,
                  "Retención IVA": r.retencion_iva,
                  "Comp. Retención IVA": r.comp_retencion_iva,
                }))
              : rawRows.map((r) => sheetRow({
                  "N° Operacion": r.nro_op,
                  "Fecha Emisión": r.fecha_emision,
                  "Tipo Doc.": r.tipo_doc,
                  Documento: r.documento,
                  "No. Nota Débito": r.nota_debito,
                  "No. Nota Crédito": r.nota_credito,
                  "Factura Afectada": r.factura_afectada,
                  "No. Control": r.nro_control,
                  "Razón Social": r.razon_social,
                  RIF: r.rif,
                  "Total + Impuesto": r.total_con_iva,
                  "Exento / SDCF": r.exento_sdcf,
                  "ET Base Imponible": r.et_base,
                  "ET (%)": r.et_pct,
                  "ET Impuesto": r.et_impuesto,
                  "NA Base 16%": r.na_base_16,
                  "NA (%) 16": r.na_pct_16,
                  "NA Impuesto 16%": r.na_imp_16,
                  "NA Base 8%": r.na_base_8,
                  "NA (%) 8": r.na_pct_8,
                  "NA Impuesto 8%": r.na_imp_8,
                  "NA Base 31%": r.na_base_31,
                  "NA (%) 31": r.na_pct_31,
                  "NA Impuesto 31%": r.na_imp_31,
                  "Comp. Retención IVA": r.comp_retencion_iva,
                  "IVA Retenido": r.iva_retenido,
                })),
          },
        ]);
        return xlsxResponse(
          `cifra-libro-${data.book.book_type}-${data.book.period_start}.xlsx`,
          buf,
        );
      }
      case "payments": {
        const data = await loadPayments();
        if (!data) return new Response("Sin empresa", { status: 400 });
        const buf = buildXlsxBuffer([
          {
            name: "Pagos",
            rows: data.rows.map((r) => ({
              Fecha: r.fecha,
              Tipo: r.tipo,
              Tercero: r.tercero,
              RIF: r.rif,
              Monto: r.monto,
              Moneda: r.moneda,
              Tasa: r.tasa,
              Referencia: r.referencia,
              Memo: r.memo,
              Estado: r.estado,
            })),
          },
        ]);
        const today = new Date().toISOString().slice(0, 10);
        return xlsxResponse(`cifra-pagos-${today}.xlsx`, buf);
      }
      default:
        return new Response("Reporte desconocido", { status: 404 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error export";
    return new Response(message, { status: 500 });
  }
}
