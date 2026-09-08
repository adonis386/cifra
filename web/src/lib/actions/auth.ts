"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { getRequestOrigin } from "@/lib/auth/site-url.server";
import {
  mapAuthError,
  validateEmail,
  validatePassword,
} from "@/lib/auth/validation";

export type AuthState = {
  error?: string;
  success?: string;
  email?: string;
};

async function needsMfaChallenge() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = safeNextPath(String(formData.get("next") || "/app"));

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  if (emailError || passwordError) {
    return { error: emailError || passwordError };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  if (await needsMfaChallenge()) {
    redirect(`/mfa?next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const firstName = String(formData.get("first_name") || "").trim();
  const lastName = String(formData.get("last_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  if (validateEmail(email)) return { error: validateEmail(email) };
  const passwordError = validatePassword(password, { create: true });
  if (passwordError) return { error: passwordError };

  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/app`,
      data: {
        full_name: fullName || email,
        given_name: firstName,
        family_name: lastName,
      },
    },
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  if (!data.session) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  redirect("/app");
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const emailError = validateEmail(email);
  if (emailError) return { error: emailError };

  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  return {
    success:
      "Si ese correo está registrado, te enviamos un enlace para crear una contraseña nueva. Revisa también spam.",
    email,
  };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm_password") || "");
  const passwordError = validatePassword(password, { create: true });
  if (passwordError) return { error: passwordError };
  if (password !== confirm) {
    return { error: "Las contraseñas no coinciden. Escríbelas otra vez." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: mapAuthError(error.message) };
  }

  redirect("/app");
}

export async function sendEmailOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const emailError = validateEmail(email);
  if (emailError) return { error: emailError };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  return {
    success: "Te enviamos un código de 6 dígitos. Introdúcelo abajo.",
    email,
  };
}

export async function verifyEmailOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const token = String(formData.get("token") || "").replace(/\s/g, "");
  const next = safeNextPath(String(formData.get("next") || "/app"));

  if (validateEmail(email)) return { error: validateEmail(email), email };
  if (!/^\d{6}$/.test(token)) {
    return {
      error: "El código tiene 6 dígitos. Pégalo completo si lo copiaste.",
      email,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { error: mapAuthError(error.message), email };
  }

  if (await needsMfaChallenge()) {
    redirect(`/mfa?next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function verifyMfa(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const code = String(formData.get("code") || "").replace(/\s/g, "");
  const next = safeNextPath(String(formData.get("next") || "/app"));

  if (!/^\d{6}$/.test(code)) {
    return { error: "El código de la app autenticadora tiene 6 dígitos." };
  }

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: mapAuthError(listError.message) };

  const factor = factors?.totp.find((item) => item.status === "verified");
  if (!factor) {
    return { error: "No hay un segundo factor activo. Entra con correo y contraseña." };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    return { error: mapAuthError(challengeError?.message || "No se pudo iniciar la verificación.") };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
