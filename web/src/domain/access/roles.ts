export type MemberRole = "owner" | "admin" | "accountant" | "viewer";

export function isCompanyAdmin(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export function paymentAdminActions(state: string | null | undefined) {
  const value = String(state || "confirmed");
  return {
    canReset: value === "confirmed" || value === "done",
    canEdit: value === "draft",
    canConfirm: value === "draft",
  };
}
