"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createCompany,
  type CompanyState,
  type CompanyValues,
} from "@/lib/actions/company";
import { Button, FieldError, Input, Label } from "@/components/ui";

const empty: CompanyValues = {
  name: "",
  rif: "",
  address: "",
  email: "",
  phone: "",
};

const initial: CompanyState = {};

export function CompanyForm() {
  const [state, action, pending] = useActionState(createCompany, initial);
  const [form, setForm] = useState<CompanyValues>(empty);

  useEffect(() => {
    if (state.values) setForm(state.values);
  }, [state.values]);

  function set<K extends keyof CompanyValues>(key: K, value: CompanyValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form action={action} className="mx-auto max-w-lg space-y-4">
      <div>
        <Label htmlFor="name">Razón social</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="Mi Empresa C.A."
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="rif">RIF</Label>
        <Input
          id="rif"
          name="rif"
          required
          placeholder="J-12345678-9"
          className="font-mono"
          value={form.rif}
          onChange={(e) => set("rif", e.target.value)}
        />
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Guiones y puntos se aceptan. Se guarda normalizado.
        </p>
      </div>
      <div>
        <Label htmlFor="address">Dirección</Label>
        <Input
          id="address"
          name="address"
          placeholder="Opcional"
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">Correo empresa</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="Opcional"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="phone">Teléfono</Label>
          <Input
            id="phone"
            name="phone"
            placeholder="Opcional"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
      </div>
      <FieldError message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Crear empresa"}
      </Button>
    </form>
  );
}
