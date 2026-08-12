export function agingBucket(dueDate: string | null, today: Date) {
  if (!dueDate) return "current";
  const due = new Date(dueDate + "T00:00:00");
  const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function partnerName(
  partners:
    | { name: string; rif?: string }
    | { name: string; rif?: string }[]
    | null
    | undefined,
) {
  if (!partners) return { name: "—", rif: "—" };
  const p = Array.isArray(partners) ? partners[0] : partners;
  return { name: p?.name || "—", rif: p?.rif || "—" };
}
