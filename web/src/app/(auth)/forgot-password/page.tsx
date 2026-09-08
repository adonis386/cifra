import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-[var(--color-foreground)]">
        Recuperar contraseña
      </h2>
      <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        Te enviaremos un enlace para crear una contraseña nueva.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
