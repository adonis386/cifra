import * as XLSX from "xlsx";

export type SheetRow = Record<string, string | number | null | undefined>;

export function buildXlsxBuffer(
  sheets: Array<{ name: string; rows: SheetRow[] }>,
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return out;
}

export function xlsxResponse(filename: string, buffer: Buffer) {
  const safe = filename.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/gi, "_");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}
