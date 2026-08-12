import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--brand-bg)] text-[var(--brand-light)] lg:flex-row">
      {/* Panel marca — full-bleed en desktop */}
      <aside className="relative flex flex-1 flex-col justify-between overflow-hidden px-8 py-10 lg:max-w-[48%] lg:px-12 lg:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(37,99,235,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 90%, rgba(37,99,235,0.18), transparent 50%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative z-10">
          <Link
            href="https://www.informaticagonzalez.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 transition-opacity hover:opacity-90"
          >
            <Image
              src="/brand/ig-logo-white.webp"
              alt="Informática González"
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
              priority
            />
            <span className="label-brand text-[11px] text-white/80">
              Informática González
            </span>
          </Link>
        </div>

        <div className="relative z-10 my-12 max-w-md lg:my-0">
          <p className="label-brand mb-4">Producto</p>
          <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-tight md:text-6xl">
            Cifra
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/70">
            Contabilidad fiscal para Venezuela. Libros, retenciones y control —
            hecho para operar.
          </p>
        </div>

        <p className="relative z-10 text-xs text-white/45">
          Desarrollo de software a medida · Caracas, VE
        </p>
      </aside>

      {/* Formulario */}
      <main className="relative flex flex-1 items-center justify-center bg-[var(--brand-light)] px-4 py-12 text-[var(--color-foreground)] sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="font-display text-3xl font-semibold tracking-tight text-[var(--color-foreground)]">
              Cifra
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Contabilidad Venezuela
            </p>
          </div>
          <div className="border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-md)] sm:p-8">
            {children}
          </div>
          <p className="mt-6 text-center text-xs text-[var(--color-muted-foreground)]">
            Un producto de{" "}
            <a
              href="https://www.informaticagonzalez.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--brand-accent)] underline-offset-4 hover:underline"
            >
              Informática González
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
