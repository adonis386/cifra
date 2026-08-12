# Supabase — Cifra

## Cómo aplicar el schema

1. Abre el proyecto: https://supabase.com/dashboard/project/sbhwjccqoilhjwdwmtep
2. Ve a **SQL Editor** → New query
3. Ejecuta en orden:
   - `migrations/20260812000001_cifra_schema.sql`
   - `migrations/20260812000002_cifra_rls.sql`
   - `migrations/20260812000003_cifra_fixes_seed.sql`
   - `migrations/20260812000004_cifra_full_fiscal.sql`
   - `migrations/20260812000005_fix_companies_rls.sql`
   - `migrations/20260812000006_rif_format_flexible.sql`
   - `migrations/20260812000007_accounting_core.sql`
   - `migrations/20260812000008_dual_currency_fiscal.sql` ← tasa USD, sin_cred, ISLR en líneas, N° control
   - `migrations/20260812000009_cifra_libro.sql` ← extractos caja/banco, períodos, auditoría ampliada

O pega el contenido de `migrations/ALL.sql` (si existe) de una vez, y luego aplica `00008` si ALL aún no la incluye.

## Tablas

| Tabla | Uso |
|-------|-----|
| `profiles` | Usuario |
| `companies` / `company_members` | Multi-empresa + roles |
| `partners` | Clientes/proveedores (RIF) |
| `tax_rates` / `islr_*` | Catálogos fiscales |
| `exchange_rates` | Tasa del día Bs/USD |
| `invoices` / `invoice_lines` | Compras/ventas + N/C N/D + dual currency + concepto ISLR |
| `withholding_iva*` | Retenciones IVA + líneas TXT |
| `withholding_islr*` | Retenciones ISLR |
| `fiscal_books*` | Libro compras/ventas |
| `account_*` / `payments` | Core contable Odoo-like |
| `export_files` | Metadatos TXT/XML/PDF |
| `audit_logs` | Auditoría |
| `sequences` | Numeración comprobantes / N° control |

## Roles RLS

- `owner` / `admin` — administrar empresa y miembros
- `accountant` — CRUD documentos
- `viewer` — solo lectura

Storage buckets: `exports`, `logos` (path `{company_id}/...`).
