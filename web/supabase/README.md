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

## Seeds de demo

Para probar reportes con un usuario concreto:

1. Aplica migraciones `00007`, `00008` y (opcional) `00009`
2. SQL Editor → pega `seeds/seed_demo_reports_user.sql` → **Run**
3. Recarga la app

El seed está ligado al user `f97bbcb7-d10b-472c-9fcb-c470ed9e11a9` (usa su empresa o crea `Cifra Demo Seed CA`).
Datos marcados con `SEED_CIFRA_REPORTS` (re-ejecutable / limpia el seed anterior).

### Qué genera

| Dato | Cantidad | Para probar |
|------|----------|-------------|
| Clientes / proveedores | 4 | Estado de cuenta, CxC/CxP |
| Facturas (abierta / parcial / pagada / aging) | 6 | Aging, residuales, dual `$/Bs` |
| Pagos + asientos | 3 | Tesorería, mayor, aplicaciones |
| Retenciones IVA | 2 | Cumplir → retenciones |
| Libros fiscales | 2 | Libro compras/ventas |
| Extracto banco | 1 | Caja y bancos (si `00009`) |
| Asiento de apertura | 1 | Mayor / balance |
