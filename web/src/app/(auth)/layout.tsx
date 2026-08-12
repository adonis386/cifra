export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--color-background)] px-4 py-12">
      <div className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-[var(--color-primary)]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-72 w-72 rounded-full bg-[var(--color-accent)]/10 blur-3xl" />

      <div className="relative mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-primary)]">
          Cifra
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Contabilidad Venezuela
        </p>
      </div>
      <div className="relative w-full max-w-md rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        {children}
      </div>
    </div>
  );
}
