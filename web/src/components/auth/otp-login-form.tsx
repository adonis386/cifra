"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { sendEmailOtp, verifyEmailOtp, type AuthState } from "@/lib/actions/auth";
import { validateEmail } from "@/lib/auth/validation";
import { Button, FieldError, Label } from "@/components/ui";
import { AuthField } from "@/components/auth/auth-field";
import { OtpInput } from "@/components/auth/otp-input";

const initial: AuthState = {};
const RESEND_SECONDS = 60;

export function OtpLoginForm({ nextPath }: { nextPath: string }) {
  const [sent, sendAction, sending] = useActionState(sendEmailOtp, initial);
  const [verified, verifyAction, verifying] = useActionState(verifyEmailOtp, initial);
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(0);
  const email = verified.email || sent.email || "";

  useEffect(() => {
    if (!sent.success) return;
    setSeconds(RESEND_SECONDS);
  }, [sent.success]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  return (
    <div className="space-y-4">
      <form action={sendAction} className="space-y-4">
        <AuthField
          id="email"
          name="email"
          label="Correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={email}
          validate={validateEmail}
        />
        <FieldError message={sent.error} />
        {sent.success ? (
          <p className="text-sm text-[var(--color-success)]">{sent.success}</p>
        ) : null}
        <Button type="submit" className="w-full" disabled={sending || seconds > 0}>
          {sending
            ? "Enviando…"
            : seconds > 0
              ? `Reenviar código en ${seconds}s`
              : sent.success
                ? "Reenviar código"
                : "Enviar código"}
        </Button>
      </form>

      {sent.success || email ? (
        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <Label htmlFor="otp-0">Código de 6 dígitos</Label>
            <OtpInput value={code} onChange={setCode} disabled={verifying} />
          </div>
          <FieldError message={verified.error} />
          <Button type="submit" className="w-full" disabled={verifying || code.length !== 6}>
            {verifying ? "Comprobando…" : "Confirmar código"}
          </Button>
        </form>
      ) : null}

      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        <Link
          href="/login"
          className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Volver a correo y contraseña
        </Link>
      </p>
    </div>
  );
}
