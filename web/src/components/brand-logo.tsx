import Image from "next/image";

export function BrandMark({
  size = 32,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/mark.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      priority={priority}
    />
  );
}

export function BrandLockup({
  inverted = false,
  compact = false,
}: {
  inverted?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-2.5"}`}>
      <BrandMark size={compact ? 28 : 36} priority />
      <div className="min-w-0">
        <p
          className={`font-bold leading-none tracking-tight ${
            compact ? "text-lg" : "text-xl"
          } ${inverted ? "text-white" : "text-[var(--color-foreground)]"}`}
        >
          Sifra
        </p>
        <p
          className={`mt-1 text-[11px] ${
            inverted
              ? "text-[var(--color-sidebar-muted)]"
              : "text-[var(--color-muted-foreground)]"
          }`}
        >
          Contabilidad VE
        </p>
      </div>
    </div>
  );
}
