# Sifra — Contabilidad Venezuela

## App web
- `web/` — Next.js + Supabase (subdominio: `sifra.informaticagonzalez.com`)
- Env local: `web/.env.local` (no se sube a git)
- Ejemplo: `web/.env.example`

```bash
cd web
npm run dev
```

## Módulo Libro (identidad Sifra)
No clona el menú Odoo. Flujos propios:

| Sección | Rutas |
|---------|--------|
| Operar | facturas, CxC/CxP, pagos |
| Libro | caja/bancos, asientos, mayor, estado de cuenta, plan, reportes, auditoría |
| Cumplir | libros fiscales, retenciones, municipal |

## Fuentes Odoo (referencia de negocio)
- raíz / `models` / `views` — módulo Accounting (Odoo 19)
- `l10n_ve_full/` — localización VE (Odoo 17 Legacy Cargo): libros, TXT IVA, XML ISLR

Repo: https://github.com/adonis386/sifra.git
