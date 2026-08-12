/**
 * Scraper del tipo de cambio de referencia USD del BCV.
 * Fuente: https://www.bcv.org.ve/  (#dolar)
 *
 * El certificado SSL del BCV suele fallar la cadena CA; se consulta
 * con verificación TLS desactivada (mismo patrón que APIs públicas VE).
 */

import https from "node:https";

export type BcvUsdRate = {
  rate: number;
  rateDate: string; // YYYY-MM-DD
  raw: string;
  sourceUrl: string;
};

const BCV_URL = "https://www.bcv.org.ve/";

const MONTHS_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** "764,34860000" | "1.234,56" → number */
export function parseVeNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  // miles con punto + decimales con coma: 1.234,56
  if (/\.\d{3},\d+$/.test(cleaned) || /^\d{1,3}(\.\d{3})+,\d+$/.test(cleaned)) {
    const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // solo coma decimal: 764,34860000
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number(cleaned.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseBcvHtml(html: string): BcvUsdRate {
  // Prefer #dolar block → <strong>764,34860000</strong>
  const dolarBlock =
    html.match(/id=["']dolar["'][\s\S]{0,1200}/i)?.[0] ||
    html.match(/USD[\s\S]{0,400}?[\d.,]{4,}/i)?.[0] ||
    "";

  const strong =
    dolarBlock.match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i)?.[1] ||
    dolarBlock.match(/([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2,})/)?.[1] ||
    null;

  if (!strong) {
    throw new Error("No se encontró el monto USD (#dolar) en bcv.org.ve");
  }

  const rate = parseVeNumber(strong);
  if (!rate) {
    throw new Error(`Monto USD inválido en BCV: "${strong}"`);
  }

  // content="2026-08-12T00:00:00-04:00"
  const iso =
    html.match(
      /Fecha Valor:[\s\S]{0,300}?content=["'](\d{4}-\d{2}-\d{2})T/i,
    )?.[1] ||
    html.match(/content=["'](\d{4}-\d{2}-\d{2})T[^"']*["'][^>]*>\s*[^<]*\d{4}/i)?.[1] ||
    null;

  let rateDate = iso;
  if (!rateDate) {
    const human = html.match(
      /Fecha Valor:[\s\S]{0,200}?(\d{1,2})\s+([A-Za-záéíóúñ]+)\s+(\d{4})/i,
    );
    if (human) {
      const day = Number(human[1]);
      const month = MONTHS_ES[human[2].toLowerCase()];
      const year = Number(human[3]);
      if (month && day && year) {
        rateDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  if (!rateDate) {
    rateDate = new Date().toISOString().slice(0, 10);
  }

  return {
    rate: Number(rate.toFixed(6)),
    rateDate,
    raw: strong.trim(),
    sourceUrl: BCV_URL,
  };
}

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-VE,es;q=0.9,en;q=0.8",
          Referer: url,
        },
        timeout: 25000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchHtml(new URL(res.headers.location, url).toString())
            .then(resolve)
            .catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`BCV HTTP ${res.statusCode || "sin status"}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout consultando BCV"));
    });
  });
}

/** Consulta en vivo https://www.bcv.org.ve/ y devuelve la tasa USD. */
export async function fetchBcvUsdRate(): Promise<BcvUsdRate> {
  const html = await fetchHtml(BCV_URL);
  return parseBcvHtml(html);
}
