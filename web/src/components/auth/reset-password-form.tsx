"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/lib/actions/auth";
import { validatePassword } from "@/lib/auth/validation";
import { Button, FieldError } from "@/components/ui";
import { AuthField } from "@/components/auth/auth-field";

const initial: AuthState = {};

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="space-y-4">
      <AuthField
        id="password"
        name="password"
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Mínimo 8 caracteres."
        validate={(value) => validatePassword(value, { create: true })}
      />
      <AuthField
        id="confirm_password"
        name="confirm_password"
        label="Confirmar contraseña"
        type="password"
        autoComplete="new-password"
        required
        validate={(value) =>
          value
            ? ""
            : "Vuelve a escribir la misma contraseña para confirmarla."
        }
      />
      <FieldError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
