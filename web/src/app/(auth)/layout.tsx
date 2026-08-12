import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--color-background)] px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 15% 0%, rgba(37,99,235,0.10), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(37,99,235,0.06), transparent 50%)",
        }}
      />

      <div className="relative mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-foreground)]">
          Cifra
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Contabilidad Venezuela
        </p>
      </div>

      <div className="relative w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        {children}
      </div>

      <p className="relative mt-8 text-center text-xs text-[var(--color-muted-foreground)]">
        Desarrollado por{" "}
        <Link
          href="https://www.informaticagonzalez.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Informática González
        </Link>
      </p>
    </div>
  );
}
