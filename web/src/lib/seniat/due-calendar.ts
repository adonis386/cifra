/** Vencimiento ordinario SENIAT: día 15 del mes siguiente al período. */

export type SeniatDue = {
  label: string;
  period: string;
  due: string;
  overdue: boolean;
};

function prevYearMonth(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function seniatMonthlyDue(todayIso: string): SeniatDue[] {
  const yearMonth = todayIso.slice(0, 7);
  const period = prevYearMonth(yearMonth);
  const due = `${yearMonth}-15`;
  const overdue = todayIso > due;
  return [
    { label: "IVA", period, due, overdue },
    { label: "ISLR (retenciones)", period, due, overdue },
    { label: "Municipal", period, due, overdue },
  ];
}
