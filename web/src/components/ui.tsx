import { type ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "soft";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
  const variants = {
    primary:
      "bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-primary-soft)]",
    secondary:
      "border border-[var(--color-border)] text-[var(--color-foreground)] bg-white hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
    soft:
      "bg-[var(--brand-accent-muted)] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,white)]",
    ghost:
      "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3.5 py-3 text-sm text-[var(--color-foreground)] transition-[border-color,box-shadow] duration-300 placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--brand-accent)] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_srgb,var(--brand-accent)_18%,transparent)] ${className}`}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-[var(--color-foreground)]"
    >
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-sm text-[var(--color-destructive)]" role="alert">
      {message}
    </p>
  );
}
