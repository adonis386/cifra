/** Límites de un período mensual YYYY-MM. Sin I/O. */

export function monthBounds(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return null;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, name: `${y}-${String(m).padStart(2, "0")}` };
}
