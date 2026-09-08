import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_AUTH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email",
];

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const path = request.nextUrl.pathname;
  const isPublicAuth = startsWithAny(path, PUBLIC_AUTH_PREFIXES);
  const isMfaRoute = path === "/mfa" || path.startsWith("/mfa/");
  const isResetRoute = path === "/reset-password" || path.startsWith("/reset-password/");
  const isAuthCallback = path.startsWith("/auth/");
  const isAppRoute = path.startsWith("/app");
  const isPrintRoute = path.startsWith("/print");
  const isExportRoute = path.startsWith("/api/export");

  if (!isAuthenticated && (isAppRoute || isPrintRoute || isExportRoute || isMfaRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && !isAuthCallback) {
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa =
      aal.data?.nextLevel === "aal2" && aal.data.currentLevel !== "aal2";

    if (needsMfa && !isMfaRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa";
      url.searchParams.set("next", path.startsWith("/app") ? path : "/app");
      return NextResponse.redirect(url);
    }

    if (!needsMfa && isPublicAuth) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (!isAuthenticated && isResetRoute) {
    return supabaseResponse;
  }

  return supabaseResponse;
}
