"use client";

import { useActionState, useRef } from "react";
import { postChatterMessage, type ChatterState } from "@/lib/actions/chatter";
import type { ChatterMessage } from "@/repositories/chatter.repository";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ChatterState = {};

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString("es-VE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function DocumentChatter({
  resModel,
  resId,
  messages,
  payments = [],
}: {
  resModel: "invoice" | "payment";
  resId: string;
  messages: ChatterMessage[];
  payments?: Array<{ id: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(postChatterMessage, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Chatter</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
          Notas, comprobantes y el historial de cobros de este documento.
        </p>
      </div>
      <form ref={formRef} action={action} className="space-y-3 border-b border-[var(--color-border)] px-4 py-4">
        <input type="hidden" name="res_model" value={resModel} />
        <input type="hidden" name="res_id" value={resId} />
        <div>
          <Label htmlFor="chatter_body">Nota</Label>
          <textarea
            id="chatter_body"
            name="body"
            rows={3}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3.5 py-3 text-sm"
            placeholder="Ej. Cliente envió captura de Zelle…"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Label htmlFor="chatter_file">Comprobante</Label>
            <Input id="chatter_file" name="file" type="file" accept="image/*,.pdf" className="max-w-full" />
          </div>
          {payments.length ? (
            <div className="min-w-0">
              <Label htmlFor="chatter_payment">Cobro</Label>
              <Select id="chatter_payment" name="payment_id" defaultValue={payments.length === 1 ? payments[0].id : ""}>
                {payments.length > 1 ? <option value="">Sin vincular</option> : null}
                {payments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
        <FieldError message={state.error} />
        {state.success ? (
          <p className="text-sm text-[var(--color-accent)]">{state.success}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending} className="min-w-32">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Elige el cobro, adjunta el comprobante o escribe una nota, y pulsa Guardar.
          </p>
        </div>
      </form>
      <ol className="space-y-0 divide-y divide-[var(--color-border)]">
        {messages.length ? (
          messages.map((msg) => (
            <li key={msg.id} className="px-4 py-3">
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {msg.subtype === "notification" ? "Sistema" : msg.author_name || "Usuario"}
                {" · "}
                {when(msg.created_at)}
              </p>
              <p className="mt-1 text-sm leading-relaxed">{msg.body}</p>
              {msg.files.length ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {msg.files.map((file) => (
                    <li key={file.id}>
                      {file.url ? (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:border-[var(--color-primary)]"
                        >
                          {file.filename}
                        </a>
                      ) : (
                        <span className="text-xs">{file.filename}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))
        ) : (
          <li className="px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
            Aún no hay notas ni comprobantes.
          </li>
        )}
      </ol>
    </section>
  );
}
