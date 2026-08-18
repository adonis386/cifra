import Link from "next/link";
import { ProductForm } from "@/components/products/product-form";
import { deleteProduct } from "@/lib/actions/products";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function ProductsPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Productos" />
        <Link
          href="/app/empresa/nueva"
          className="text-sm font-semibold text-[var(--color-primary)] underline"
        >
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, code, name, price_unit, tax_code, active")
    .eq("company_id", company.id)
    .eq("active", true)
    .order("name");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Maestros"
        title="Productos"
        description="Catálogo con precios para cargar líneas de factura más rápido."
      />

      <SectionCard title="Nuevo producto">
        {error && /relation|does not exist|schema/i.test(error.message) ? (
          <p className="text-sm text-[var(--color-destructive)]">
            Ejecuta en Supabase la migración{" "}
            <code className="font-mono text-xs">
              20260818000014_products_registration_sequences.sql
            </code>
            .
          </p>
        ) : (
          <ProductForm />
        )}
      </SectionCard>

      <SectionCard title="Listado">
        {(products || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Nombre</Th>
                <Th>Alícuota</Th>
                <Th className="text-right">Precio</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {(products || []).map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.code || "—"}</Td>
                  <Td className="font-medium">{p.name}</Td>
                  <Td>{p.tax_code}</Td>
                  <Td className="text-right font-mono">
                    {formatMoney(Number(p.price_unit || 0))}
                  </Td>
                  <Td className="text-right">
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        className="text-[var(--color-destructive)]"
                      >
                        Desactivar
                      </Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState
            title="Sin productos"
            description="Crea el primero arriba (tras aplicar la migración SQL)."
          />
        )}
      </SectionCard>
    </div>
  );
}
