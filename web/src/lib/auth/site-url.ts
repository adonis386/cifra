export function getPublicSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
}

export function getBrowserOrigin() {
  const configured = getPublicSiteUrl();
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
