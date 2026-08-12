import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/app";

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-semibold tracking-tight text-[var(--color-foreground)]">
        Entrar
      </h2>
      <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        Accede a tus libros y retenciones.
      </p>
      <LoginForm nextPath={nextPath} />
    </div>
  );
}
