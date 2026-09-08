"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "@/lib/actions/auth";
import { validateEmail } from "@/lib/auth/validation";
import { Button, FieldError } from "@/components/ui";
import { AuthField } from "@/components/auth/auth-field";

const initial: AuthState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.success) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-foreground)]">{state.success}</p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Volver a entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <AuthField
        id="email"
        name="email"
        label="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        validate={validateEmail}
      />
      <FieldError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace"}
      </Button>
      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        <Link
          href="/login"
          className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Volver a entrar
        </Link>
      </p>
    </form>
  );
}
