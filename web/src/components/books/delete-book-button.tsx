"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

export function DeleteBookButton({ bookId }: { bookId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    if (!window.confirm("¿Eliminar este libro del histórico?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/books/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: bookId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setError(data.error || "No se pudo eliminar.");
          return;
        }
        router.push("/app/books");
        router.refresh();
      } catch {
        setError("Error de red.");
      }
    });
  }

  return (
    <span className="mt-1 inline-flex flex-col items-stretch">
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        className="h-auto px-0 py-0 text-xs text-[var(--color-destructive)]"
        onClick={onDelete}
      >
        {pending ? "Eliminando…" : "Eliminar"}
      </Button>
      {error ? (
        <span className="text-xs text-[var(--color-destructive)]">{error}</span>
      ) : null}
    </span>
  );
}
