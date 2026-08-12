"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "@/lib/actions/auth";
import { Button, FieldError, Input, Label } from "@/components/ui";

const initial: AuthState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="full_name">Nombre</Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          placeholder="Tu nombre"
        />
      </div>
      <div>
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@empresa.com"
        />
      </div>
      <div>
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Mínimo 8 caracteres"
        />
      </div>
      <FieldError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando…" : "Crear cuenta"}
      </Button>
      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </form>
  );
}
