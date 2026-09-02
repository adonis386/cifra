"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [state, action, pending] = useActionState(updateCompanyBranding, initial);
  const [preview, setPreview] = useState<string | null>(company.logo_url);
  const [localFileUrl, setLocalFileUrl] = useState<string | null>(null);

  useEffect(() => {
    setPreview(company.logo_url);
  }, [company.logo_url]);

  useEffect(() => {
    if (!state.success && !state.error) return;
    if (state.logo_url) {
      setPreview(state.logo_url);
      setLocalFileUrl(null);
    } else if (state.logo_path === null) {
      setPreview(null);
      setLocalFileUrl(null);
    }
    router.refresh();
  }, [state.logo_url, state.logo_path, state.success, state.error, router]);

  useEffect(() => {
    return () => {
      if (localFileUrl) URL.revokeObjectURL(localFileUrl);
    };
  }, [localFileUrl]);

  const shown = localFileUrl || preview;

  return (
    <form action={action} className="space-y-4">
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
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt="Logo"
              className="h-16 w-16 rounded-[var(--radius-md)] border border-[var(--color-border)] object-contain bg-white"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] text-[10px] text-[var(--color-muted-foreground)]">
              Sin logo
            </div>
          )}
          <div className="flex-1 space-y-2">
            <div>
              <Label htmlFor="logo">Logo (PNG/JPG/WEBP, máx. 2 MB)</Label>
              <Input
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (localFileUrl) URL.revokeObjectURL(localFileUrl);
                  if (file) {
                    setLocalFileUrl(URL.createObjectURL(file));
                  } else {
                    setLocalFileUrl(null);
                  }
                }}
              />
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                Ruta en Supabase: bucket <code>logos</code> →{" "}
                <code>{`{empresa_id}/logo.ext`}</code>
                {(state.logo_path ?? company.logo_path) ? (
                  <>
                    <br />
                    Actual: <code>{state.logo_path ?? company.logo_path}</code>
                  </>
                ) : null}
              </p>
            </div>
            {(state.logo_path ?? company.logo_path) ? (
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                <input type="checkbox" name="remove_logo" className="h-3.5 w-3.5" />
                Quitar logo actual
              </label>
            ) : null}
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
              placeholder="Ej: Documento generado por Sifra · confidencial"
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
