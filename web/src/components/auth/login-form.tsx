"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "@/lib/actions/auth";
import { validateEmail, validatePassword } from "@/lib/auth/validation";
import { Button, FieldError } from "@/components/ui";
import { AuthField } from "@/components/auth/auth-field";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

const initial: AuthState = {};

export function LoginForm({
  nextPath,
  banner,
}: {
  nextPath: string;
  banner?: string;
}) {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <div className="space-y-6">
      {banner ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-muted)] px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
          {banner}
        </p>
      ) : null}

      <OAuthButtons nextPath={nextPath} />

      <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        o con correo
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={nextPath} />
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
        <AuthField
          id="password"
          name="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          validate={validatePassword}
        />
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="min-h-11 text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
          >
            Olvidé mi contraseña
          </Link>
        </div>
        <FieldError message={state.error} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        <Link
          href={`/login/otp?next=${encodeURIComponent(nextPath)}`}
          className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Entrar con código de un solo uso
        </Link>
      </p>
      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        ¿No tienes cuenta?{" "}
        <Link
          href="/signup"
          className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
