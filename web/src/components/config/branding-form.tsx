"use client";

import { useActionState } from "react";
import {
  updateCompanyBranding,
  type BrandingState,
} from "@/lib/actions/branding";
import { Button, FieldError, Input, Label } from "@/components/ui";

type CompanyBranding = {
  name: string;
  rif: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_path: string | null;
  logo_url: string | null;
  print_subtitle: string | null;
  print_footer: string | null;
  print_show_logo: boolean;
};

const initial: BrandingState = {};

export function BrandingForm({ company }: { company: CompanyBranding }) {
  const [state, action, pending] = useActionState(updateCompanyBranding, initial);

  return (
    <form action={action} className="space-y-4" encType="multipart/form-data">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Razón social</Label>
          <Input id="name" name="name" required defaultValue={company.name} />
        </div>
        <div>
          <Label htmlFor="rif">RIF</Label>
          <Input
            id="rif"
            name="rif"
            required
            defaultValue={company.rif}
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" defaultValue={company.phone || ""} />
        </div>
        <div>
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={company.email || ""}
          />
        </div>
        <div>
          <Label htmlFor="website">Sitio web</Label>
          <Input
            id="website"
            name="website"
            placeholder="https://"
            defaultValue={company.website || ""}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="address">Dirección fiscal</Label>
          <Input
            id="address"
            name="address"
            defaultValue={company.address || ""}
          />
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-4">
        <h3 className="mb-3 text-sm font-semibold">Membrete PDF</h3>
        <div className="mb-4 flex items-center gap-4">
          {company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logo_url}
              alt="Logo actual"
              className="h-16 w-16 rounded-[var(--radius-md)] border border-[var(--color-border)] object-contain bg-white"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] text-[10px] text-[var(--color-muted-foreground)]">
              Sin logo
            </div>
          )}
          <div className="flex-1">
            <Label htmlFor="logo">Logo (PNG/JPG/WEBP, máx. 2 MB)</Label>
            <Input id="logo" name="logo" type="file" accept="image/*" />
          </div>
        </div>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="print_show_logo"
            defaultChecked={company.print_show_logo}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          Mostrar logo en PDF / impresión
        </label>
        <div className="space-y-3">
          <div>
            <Label htmlFor="print_subtitle">Subtítulo del membrete</Label>
            <Input
              id="print_subtitle"
              name="print_subtitle"
              placeholder="Ej: Contabilidad · Caracas, VE"
              defaultValue={company.print_subtitle || ""}
            />
          </div>
          <div>
            <Label htmlFor="print_footer">Pie de página</Label>
            <Input
              id="print_footer"
              name="print_footer"
              placeholder="Ej: Documento generado por Cifra · confidencial"
              defaultValue={company.print_footer || ""}
            />
          </div>
        </div>
      </div>

      <FieldError message={state.error} />
      {state.success ? (
        <p className="text-sm text-[var(--color-accent)]">{state.success}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar membrete"}
      </Button>
    </form>
  );
}
