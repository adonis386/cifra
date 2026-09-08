import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-[var(--color-foreground)]">
        Nueva contraseña
      </h2>
      <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        Elige una clave que no hayas usado en otros sitios.
      </p>
      <ResetPasswordForm />
    </div>
  );
}
