"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createPartner,
  type ActionState,
  type PartnerValues,
} from "@/lib/actions/partners";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const empty: PartnerValues = {
  name: "",
  rif: "",
  kind: "both",
  person_type: "juridica",
  email: "",
  phone: "",
  address: "",
};

const initial: ActionState = {};

export function PartnerForm() {
  const [state, action, pending] = useActionState(createPartner, initial);
  const [form, setForm] = useState<PartnerValues>(empty);
  const [resetToken, setResetToken] = useState(state.success);

  useEffect(() => {
    if (state.values) setForm(state.values);
  }, [state.values]);

  useEffect(() => {
    if (state.success && state.success !== resetToken) {
      setResetToken(state.success);
      setForm(empty);
    }
  }, [state.success, resetToken]);

  const rifPlaceholder =
    form.person_type === "natural" ? "V-12345678-9" : "J-12345678-9";
  const rifHint =
    form.person_type === "natural"
      ? "Natural: V o E. Puedes escribir con guiones."
      : "Jurídica: J, G, C o P. Guiones y puntos se aceptan.";

  function set<K extends keyof PartnerValues>(key: K, value: PartnerValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label htmlFor="name">Nombre / Razón social</Label>
        <Input
          id="name"
          name="name"
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="person_type">Persona</Label>
        <Select
          id="person_type"
          name="person_type"
          value={form.person_type}
          onChange={(e) => set("person_type", e.target.value)}
        >
          <option value="juridica">Jurídica</option>
          <option value="natural">Natural</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="rif">RIF / Cédula</Label>
        <Input
          id="rif"
          name="rif"
          required
          className="font-mono"
          placeholder={rifPlaceholder}
          value={form.rif}
          onChange={(e) => set("rif", e.target.value)}
        />
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{rifHint}</p>
      </div>
      <div>
        <Label htmlFor="kind">Tipo</Label>
        <Select
          id="kind"
          name="kind"
          value={form.kind}
          onChange={(e) => set("kind", e.target.value)}
        >
          <option value="customer">Cliente</option>
          <option value="supplier">Proveedor</option>
          <option value="both">Ambos</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="phone">Teléfono</Label>
        <Input
          id="phone"
          name="phone"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="address">Dirección</Label>
        <Input
          id="address"
          name="address"
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </div>
      <div className="md:col-span-2">
        <FieldError message={state.error} />
        {state.success && (
          <p className="mb-2 text-sm text-[var(--color-accent)]">Tercero guardado.</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar tercero"}
        </Button>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          No se permiten RIF/cédula duplicados en la misma empresa.
        </p>
      </div>
    </form>
  );
}
