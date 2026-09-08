import { headers } from "next/headers";
import { getPublicSiteUrl } from "@/lib/auth/site-url";

export async function getRequestOrigin() {
  const configured = getPublicSiteUrl();
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
