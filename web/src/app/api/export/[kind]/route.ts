import { NextRequest } from "next/server";
import { buildXlsxBuffer, xlsxResponse } from "@/lib/export/xlsx";
import {
  loadFiscalBook,
  loadInvoicesList,
  loadLedger,
  loadOpenInvoices,
  loadPartnerStatement,
  loadPayments,
  loadTrialBalance,
} from "@/lib/export/reports-data";

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
        const buf = buildXlsxBuffer([
          {
            name: data.book.book_type === "sale" ? "Libro ventas" : "Libro compras",
            rows: data.rows.map((r) => ({
              Nro: r.nro,
              Fecha: r.fecha,
              RIF: r.rif,
              Nombre: r.nombre,
              Factura: r.factura,
              Control: r.control,
              Tipo: r.tipo,
              Base: r.base,
              IVA: r.iva,
              Exento: r.exento,
              Total: r.total,
              Ret_IVA: r.ret_iva,
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
