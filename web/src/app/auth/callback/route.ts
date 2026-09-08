import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"));
  const origin = url.origin;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("No pudimos completar el inicio de sesión. Inténtalo de nuevo.")}`,
      );
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "email" | "recovery" | "invite" | "email_change" | "signup",
    });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("El enlace ya no es válido. Pide uno nuevo.")}`,
      );
    }
  } else {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Falta el código de autenticación.")}`,
    );
  }

  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") {
    return NextResponse.redirect(
      `${origin}/mfa?next=${encodeURIComponent(next)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
