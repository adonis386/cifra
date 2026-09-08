import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"));
  const origin = url.origin;

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("El enlace de confirmación está incompleto.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "email" | "recovery" | "invite" | "email_change" | "signup",
  });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("No pudimos confirmar el correo. Pide un enlace nuevo.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
