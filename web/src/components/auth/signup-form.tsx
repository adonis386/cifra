"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "@/lib/actions/auth";
import {
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/auth/validation";
import { Button, FieldError } from "@/components/ui";
import { AuthField } from "@/components/auth/auth-field";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

const initial: AuthState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);

  return (
    <div className="space-y-6">
      <OAuthButtons nextPath="/app" />

      <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        o con correo
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form action={action} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <AuthField
            id="first_name"
            name="first_name"
            label="Nombre"
            type="text"
            autoComplete="given-name"
            required
            validate={(value) => validateName(value, "Nombre")}
          />
          <AuthField
            id="last_name"
            name="last_name"
            label="Apellido"
            type="text"
            autoComplete="family-name"
            required
            validate={(value) => validateName(value, "Apellido")}
          />
        </div>
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
          autoComplete="new-password"
          required
          minLength={8}
          hint="Mínimo 8 caracteres. Evita claves que hayas usado en otros sitios."
          validate={(value) => validatePassword(value, { create: true })}
        />
        <FieldError message={state.error} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creando…" : "Crear cuenta"}
        </Button>
      </form>
      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
