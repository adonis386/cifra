"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createProduct,
  type ActionState,
  type ProductValues,
} from "@/lib/actions/products";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const empty: ProductValues = {
  code: "",
  name: "",
  description: "",
  price_unit: "0",
  tax_code: "IVA16",
};

export function ProductForm() {
  const [state, action, pending] = useActionState(createProduct, {});
  const [form, setForm] = useState<ProductValues>(empty);
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

  function set<K extends keyof ProductValues>(key: K, value: ProductValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <div>
        <Label htmlFor="code">Código</Label>
        <Input
          id="code"
          name="code"
          className="font-mono"
          value={form.code}
          onChange={(e) => set("code", e.target.value)}
          placeholder="Opcional"
        />
      </div>
      <div>
        <Label htmlFor="tax_code">Alícuota</Label>
        <Select
          id="tax_code"
          name="tax_code"
          value={form.tax_code}
          onChange={(e) => set("tax_code", e.target.value)}
        >
          <option value="IVA16">IVA 16%</option>
          <option value="IVA8">IVA 8%</option>
          <option value="EXENTO">Exento</option>
          <option value="SDCF">Sin crédito fiscal</option>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          name="name"
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="description">Descripción</Label>
        <Input
          id="description"
          name="description"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="price_unit">Precio unitario (Bs)</Label>
        <Input
          id="price_unit"
          name="price_unit"
          type="number"
          step="0.01"
          min="0"
          required
          value={form.price_unit}
          onChange={(e) => set("price_unit", e.target.value)}
        />
      </div>
      <div className="md:col-span-2 flex items-end">
        <div className="w-full">
          <FieldError message={state.error} />
          {state.success && (
            <p className="mb-2 text-sm text-[var(--color-accent)]">Producto guardado.</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar producto"}
          </Button>
        </div>
      </div>
    </form>
  );
}
