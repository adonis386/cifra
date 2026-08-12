"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "@/lib/actions/auth";
import { Button, FieldError, Input, Label } from "@/components/ui";

const initial: AuthState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />
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
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>
      <FieldError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        ¿No tienes cuenta?{" "}
        <Link
          href="/signup"
          className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
