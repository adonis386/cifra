"use client";

import { useActionState, useState } from "react";
import { verifyMfa, type AuthState } from "@/lib/actions/auth";
import { Button, FieldError, Label } from "@/components/ui";
import { OtpInput } from "@/components/auth/otp-input";

const initial: AuthState = {};

export function MfaChallengeForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(verifyMfa, initial);
  const [code, setCode] = useState("");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      <div>
        <Label htmlFor="otp-0">Código de la app autenticadora</Label>
        <OtpInput
          name="code"
          value={code}
          onChange={setCode}
          disabled={pending}
          autoComplete="one-time-code"
        />
      </div>
      <FieldError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
        {pending ? "Verificando…" : "Continuar"}
      </Button>
    </form>
  );
}
