import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-[var(--color-foreground)]">
        Crear cuenta
      </h2>
      <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        Empieza a llevar tu contabilidad fiscal.
      </p>
      <SignupForm />
    </div>
  );
}
