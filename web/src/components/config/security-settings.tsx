"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserIdentity } from "@supabase/supabase-js";
import { mapAuthError, validateOtp } from "@/lib/auth/validation";
import { Button, FieldError, Label } from "@/components/ui";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { OtpInput } from "@/components/auth/otp-input";

type Factor = { id: string; friendly_name?: string; status: string; factor_type: string };

export function SecuritySettings() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [enrolling, setEnrolling] = useState<{
    factorId: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const supabase = createClient();
    const [{ data: factorData, error: factorError }, { data: userData, error: userError }] =
      await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.getUser()]);

    if (factorError) setError(mapAuthError(factorError.message));
    if (userError) setError(mapAuthError(userError.message));

    setFactors([
      ...(factorData?.totp || []),
      ...(factorData?.phone || []),
    ]);
    setIdentities(userData.user?.identities || []);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function startEnroll() {
    setError("");
    setSuccess("");
    setBusy(true);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Sifra",
    });
    setBusy(false);
    if (enrollError || !data || !("totp" in data) || !data.totp) {
      setError(mapAuthError(enrollError?.message || "No se pudo iniciar el 2FA."));
      return;
    }
    setEnrolling({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setCode("");
  }

  async function confirmEnroll() {
    const otpError = validateOtp(code);
    if (otpError || !enrolling) {
      setError(otpError);
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrolling.factorId,
    });
    if (challengeError || !challenge) {
      setBusy(false);
      setError(mapAuthError(challengeError?.message || "No se pudo verificar el código."));
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (verifyError) {
      setError(mapAuthError(verifyError.message));
      return;
    }
    setEnrolling(null);
    setCode("");
    setSuccess("Listo. A partir de ahora te pediremos el código de la app al entrar.");
    await refresh();
  }

  async function cancelEnroll() {
    if (!enrolling) return;
    const supabase = createClient();
    await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    setEnrolling(null);
    setCode("");
  }

  async function removeFactor(factorId: string) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (unenrollError) {
      setError(mapAuthError(unenrollError.message));
      return;
    }
    setSuccess("Quitamos el segundo factor de esta cuenta.");
    await refresh();
  }

  async function unlink(identity: UserIdentity) {
    if (identities.length < 2) {
      setError("Deja al menos un método de entrada. Si quitas el último, no podrías volver a entrar.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
    setBusy(false);
    if (unlinkError) {
      setError(mapAuthError(unlinkError.message));
      return;
    }
    setSuccess("Método desvinculado.");
    await refresh();
  }

  const verifiedTotp = factors.filter((f) => f.factor_type === "totp" && f.status === "verified");
  const linkedProviders = new Set(identities.map((item) => item.provider));

  if (loading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando seguridad…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Doble factor (recomendado)</h3>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No es obligatorio. Si lo activas, Sifra te pedirá el código de la app
          autenticadora además de tu contraseña, y bloqueará cambios sensibles
          hasta que completes ese paso.
        </p>
        {verifiedTotp.length ? (
          <ul className="space-y-2">
            {verifiedTotp.map((factor) => (
              <li
                key={factor.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
              >
                <span className="text-sm">{factor.friendly_name || "App autenticadora"}</span>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => removeFactor(factor.id)}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        ) : enrolling ? (
          <div className="space-y-4">
            <p className="text-sm">
              Escanea este código con Google Authenticator, Authy o similar. Si no
              puedes escanear, escribe la clave a mano.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrolling.qr}
              alt="Código QR para activar el doble factor"
              className="mx-auto h-44 w-44 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-2"
            />
            <p className="break-all text-center font-mono text-xs text-[var(--color-muted-foreground)]">
              {enrolling.secret}
            </p>
            <div>
              <Label htmlFor="otp-0">Código de 6 dígitos</Label>
              <OtpInput value={code} onChange={setCode} disabled={busy} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || code.length !== 6} onClick={confirmEnroll}>
                {busy ? "Activando…" : "Activar 2FA"}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={cancelEnroll}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" disabled={busy} onClick={startEnroll}>
            Activar app autenticadora
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Métodos de entrada</h3>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Google y Apple se vinculan por el identificador estable del proveedor
          (`sub`), no solo por el correo. Así se evita que alguien secuestre la
          cuenta con un email sin verificar.
        </p>
        <ul className="space-y-2">
          {identities.map((identity) => (
            <li
              key={identity.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
            >
              <span className="text-sm capitalize">{identity.provider}</span>
              <Button
                type="button"
                variant="ghost"
                disabled={busy || identities.length < 2}
                onClick={() => unlink(identity)}
              >
                Desvincular
              </Button>
            </li>
          ))}
        </ul>
        {(!linkedProviders.has("google") || !linkedProviders.has("apple")) && (
          <OAuthButtons nextPath="/app/config" mode="link" />
        )}
      </div>

      <div className="rounded-[var(--radius-md)] bg-[var(--color-muted)] px-3 py-3 text-xs text-[var(--color-muted-foreground)]">
        En el panel de Supabase (producción): confirma que el correo exige
        verificación, que los OTP vencen en 1 hora o menos, y que está activa la
        vinculación manual de identidades (no automática por email). Nunca
        expongas la service_role en el navegador.
      </div>

      {success ? <p className="text-sm text-[var(--color-success)]">{success}</p> : null}
      <FieldError message={error} />
    </div>
  );
}
