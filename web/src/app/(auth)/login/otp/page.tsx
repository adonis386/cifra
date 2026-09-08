import { OtpLoginForm } from "@/components/auth/otp-login-form";

export default async function OtpLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/app";

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-[var(--color-foreground)]">
        Entrar con código
      </h2>
      <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        Te enviamos un código de un solo uso al correo. No crea cuentas nuevas.
      </p>
      <OtpLoginForm nextPath={nextPath} />
    </div>
  );
}
