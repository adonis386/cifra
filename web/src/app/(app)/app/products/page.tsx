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
        eyebrow="Configuración"
        title="Catálogo de líneas"
        description="Nombres y precios para cargar facturas. No hay stock ni inventario."
        actions={
          <Link
            href="/app/config"
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
          >
            Volver a configuración
          </Link>
        }
      />

      <SectionCard title="Nuevo producto">
        {error && /relation|does not exist|schema/i.test(error.message) ? (
          <p className="text-sm text-[var(--color-destructive)]">
            El catálogo no está disponible en esta empresa.
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
            description="Crea el primero arriba si quieres reutilizar descripciones."
          />
        )}
      </SectionCard>
    </div>
  );
}
