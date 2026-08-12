# Supabase — Cifra

## Cómo aplicar el schema

1. Abre el proyecto: https://supabase.com/dashboard/project/sbhwjccqoilhjwdwmtep
2. Ve a **SQL Editor** → New query
3. Ejecuta en orden:
   - `migrations/20260812000001_cifra_schema.sql`
   - `migrations/20260812000002_cifra_rls.sql`
   - `migrations/20260812000003_cifra_fixes_seed.sql`

O pega el contenido de `migrations/ALL.sql` (si existe) de una vez.

## Tablas

| Tabla | Uso |
|-------|-----|
| `profiles` | Usuario |
| `companies` / `company_members` | Multi-empresa + roles |
| `partners` | Clientes/proveedores (RIF) |
| `tax_rates` / `islr_*` | Catálogos fiscales |
| `invoices` / `invoice_lines` | Compras/ventas + N/C N/D |
| `withholding_iva*` | Retenciones IVA + líneas TXT |
| `withholding_islr*` | Retenciones ISLR |
| `fiscal_books*` | Libro compras/ventas |
| `export_files` | Metadatos TXT/XML/PDF |
| `audit_logs` | Auditoría |
| `sequences` | Numeración comprobantes |

## Roles RLS

- `owner` / `admin` — administrar empresa y miembros
- `accountant` — CRUD documentos
- `viewer` — solo lectura

Storage buckets: `exports`, `logos` (path `{company_id}/...`).
