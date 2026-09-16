"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { savePartner, type ActionState } from "@/lib/actions/partners";
import {
  HONORIFICS,
  ID_DOCUMENT_TYPES,
  SENIAT_PERSON_TYPES,
  VE_STATES,
  defaultSeniatType,
  emptyPartnerValues,
  personTypeFromSeniat,
  type PartnerValues,
} from "@/domain/partners/partner.service";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

const fieldClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3.5 py-3 text-sm text-[var(--color-foreground)] transition-[border-color,box-shadow] duration-300 placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--brand-accent)] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_srgb,var(--brand-accent)_18%,transparent)]";

export function PartnerForm({ partner }: { partner?: PartnerValues | null }) {
  const [state, action, pending] = useActionState(savePartner, initial);
  const [form, setForm] = useState<PartnerValues>(
    partner ? { ...emptyPartnerValues(), ...partner } : emptyPartnerValues(),
  );

  useEffect(() => {
    if (state.values) setForm(state.values);
  }, [state.values]);

  const rifPlaceholder =
    form.person_type === "natural" ? "V-12345678-9" : "J-12345678-9";

  function set<K extends keyof PartnerValues>(key: K, value: PartnerValues[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "seniat_person_type") {
        next.person_type = personTypeFromSeniat(String(value));
      }
      return next;
    });
  }

  return (
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={form.id} />
        <input type="hidden" name="person_type" value={form.person_type} />

        <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
          Identificación
        </p>
        <div className="sm:col-span-2">
          <Label htmlFor="partner-name">Nombre / Razón social</Label>
          <Input
            id="partner-name"
            name="name"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-honorific">Título</Label>
          <Select
            id="partner-honorific"
            name="honorific"
            value={form.honorific}
            onChange={(e) => set("honorific", e.target.value)}
          >
            <option value="">—</option>
            {HONORIFICS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="partner-job">Puesto de trabajo</Label>
          <Input
            id="partner-job"
            name="job_title"
            placeholder="Por ejemplo, director de ventas"
            value={form.job_title}
            onChange={(e) => set("job_title", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="partner-seniat">Tipo de persona</Label>
          <Select
            id="partner-seniat"
            name="seniat_person_type"
            value={form.seniat_person_type || defaultSeniatType(form.person_type)}
            onChange={(e) => set("seniat_person_type", e.target.value)}
          >
            {SENIAT_PERSON_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="partner-id-type">Tipo de documento</Label>
          <Select
            id="partner-id-type"
            name="id_type"
            value={form.id_type}
            onChange={(e) => set("id_type", e.target.value)}
          >
            {ID_DOCUMENT_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="partner-id-number">Documento de identidad</Label>
          <Input
            id="partner-id-number"
            name="id_number"
            className="font-mono"
            placeholder="V26217335"
            value={form.id_number}
            onChange={(e) => set("id_number", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-rif">Número de identificación fiscal</Label>
          <Input
            id="partner-rif"
            name="rif"
            required
            className="font-mono"
            placeholder={rifPlaceholder}
            value={form.rif}
            onChange={(e) => set("rif", e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            RIF SENIAT. Natural: V o E. Jurídica: J, G, C o P.
          </p>
        </div>
        <div>
          <Label htmlFor="partner-kind">Tipo</Label>
          <Select
            id="partner-kind"
            name="kind"
            value={form.kind}
            onChange={(e) => set("kind", e.target.value)}
          >
            <option value="customer">Cliente</option>
            <option value="supplier">Proveedor</option>
            <option value="both">Ambos</option>
          </Select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="is_withholding_agent"
            value="1"
            checked={form.is_withholding_agent}
            onChange={(e) => set("is_withholding_agent", e.target.checked)}
          />
          Agente de retención
        </label>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)] sm:col-span-2">
          Dirección
        </p>
        <div className="sm:col-span-2">
          <Label htmlFor="partner-street">Calle / avenida</Label>
          <Input
            id="partner-street"
            name="street"
            placeholder="Ppal, Calle 2…"
            value={form.street}
            onChange={(e) => set("street", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="partner-street2">Complemento</Label>
          <Input
            id="partner-street2"
            name="street2"
            value={form.street2}
            onChange={(e) => set("street2", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-city">Ciudad</Label>
          <Input
            id="partner-city"
            name="city"
            placeholder="Caracas"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-state">Estado</Label>
          <Select
            id="partner-state"
            name="state_name"
            value={form.state_name}
            onChange={(e) => set("state_name", e.target.value)}
          >
            <option value="">—</option>
            {VE_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="partner-muni">Municipio</Label>
          <Input
            id="partner-muni"
            name="municipality"
            value={form.municipality}
            onChange={(e) => set("municipality", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-parish">Parroquia</Label>
          <Input
            id="partner-parish"
            name="parish"
            value={form.parish}
            onChange={(e) => set("parish", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-zip">Código postal</Label>
          <Input
            id="partner-zip"
            name="zip"
            value={form.zip}
            onChange={(e) => set("zip", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-country">País</Label>
          <Input
            id="partner-country"
            name="country"
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
          />
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)] sm:col-span-2">
          Contacto
        </p>
        <div>
          <Label htmlFor="partner-phone">Teléfono</Label>
          <Input
            id="partner-phone"
            name="phone"
            placeholder="+58…"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-mobile">Móvil</Label>
          <Input
            id="partner-mobile"
            name="mobile"
            placeholder="+58…"
            value={form.mobile}
            onChange={(e) => set("mobile", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-email">Correo electrónico</Label>
          <Input
            id="partner-email"
            name="email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-web">Sitio web</Label>
          <Input
            id="partner-web"
            name="website"
            placeholder="https://"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="partner-lang">Idioma</Label>
          <Select
            id="partner-lang"
            name="lang"
            value={form.lang}
            onChange={(e) => set("lang", e.target.value)}
          >
            <option value="es_VE">Español (VE)</option>
            <option value="en_US">English (US)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="partner-tz">Zona horaria</Label>
          <Select
            id="partner-tz"
            name="timezone"
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
          >
            <option value="America/Caracas">America/Caracas</option>
            <option value="America/Bogota">America/Bogota</option>
            <option value="UTC">UTC</option>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="partner-tags">Etiquetas</Label>
          <Input
            id="partner-tags"
            name="tags"
            placeholder='Por ejemplo, "B2B", "VIP"'
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="partner-notes">Notas</Label>
          <textarea
            id="partner-notes"
            name="notes"
            rows={3}
            className={fieldClass}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <FieldError message={state.error} />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Link
            href="/app/partners"
            className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            Cancelar
          </Link>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            No se permiten RIF duplicados en la misma empresa.
          </p>
        </div>
      </form>
  );
}
