"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getBrowserOrigin } from "@/lib/auth/site-url";
import { mapAuthError } from "@/lib/auth/validation";
import { Button, FieldError } from "@/components/ui";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.7-5.5 3.7-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.8 2.2 2.6 6.4 2.6 11.6S6.8 21 12 21c5.5 0 9.1-3.9 9.1-9.3 0-.6 0-1.1-.1-1.5H12z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-.1 2.9-2.3c.7-1.1 1-2.1 1-2.2-.1 0-1.9-.7-1.9-2.2zm-1.8-5.3c.6-.8 1.1-1.8.9-2.9-1 .1-2.1.7-2.7 1.5-.6.7-1.1 1.8-.9 2.8 1 .1 2-.6 2.7-1.4z"
      />
    </svg>
  );
}

export function OAuthButtons({
  nextPath,
  mode = "signin",
}: {
  nextPath: string;
  mode?: "signin" | "link";
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"google" | "apple" | null>(null);

  async function start(provider: "google" | "apple") {
    setError("");
    setPending(provider);
    const supabase = createClient();
    const origin = getBrowserOrigin() || window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

    const { error: authError } =
      mode === "link"
        ? await supabase.auth.linkIdentity({
            provider,
            options: { redirectTo },
          })
        : await supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo,
              queryParams:
                provider === "google" ? { prompt: "select_account" } : undefined,
            },
          });

    if (authError) {
      setError(mapAuthError(authError.message));
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={Boolean(pending)}
        onClick={() => start("google")}
      >
        <GoogleIcon />
        {pending === "google"
          ? "Redirigiendo…"
          : mode === "link"
            ? "Vincular Google"
            : "Continuar con Google"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={Boolean(pending)}
        onClick={() => start("apple")}
      >
        <AppleIcon />
        {pending === "apple"
          ? "Redirigiendo…"
          : mode === "link"
            ? "Vincular Apple"
            : "Continuar con Apple"}
      </Button>
      <FieldError message={error} />
    </div>
  );
}
