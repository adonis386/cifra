const BLOCKED = ["/login", "/signup", "/forgot-password", "/verify-email"];

export function safeNextPath(value: string | null | undefined, fallback = "/app") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("://") || value.includes("\\")) return fallback;
  if (BLOCKED.some((prefix) => value === prefix || value.startsWith(`${prefix}?`))) {
    return fallback;
  }
  return value;
}
