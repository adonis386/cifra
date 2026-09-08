import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/app";

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-[var(--color-foreground)]">
        Confirma que eres tú
      </h2>
      <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        Abre tu app autenticadora e introduce el código de 6 dígitos.
      </p>
      <MfaChallengeForm nextPath={nextPath} />
    </div>
  );
}
