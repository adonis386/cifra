import Link from "next/link";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email || "tu correo";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
        Revisa tu correo
      </h2>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Te enviamos un enlace a <strong>{email}</strong> para confirmar la
        cuenta. Hasta que lo abras, no podrás entrar.
      </p>
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
      >
        Volver a entrar
      </Link>
    </div>
  );
}
