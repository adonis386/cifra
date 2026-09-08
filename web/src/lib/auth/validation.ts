const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string) {
  const email = value.trim();
  if (!email) return "Escribe tu correo, por ejemplo nombre@empresa.com.";
  if (!EMAIL_RE.test(email)) {
    return "Ese correo no parece válido. Revisa que tenga un @ y un dominio.";
  }
  return "";
}

export function validatePassword(value: string, { create = false } = {}) {
  if (!value) return "Escribe tu contraseña.";
  if (create && value.length < 8) {
    return "Usa al menos 8 caracteres. Mezcla letras y números para que sea más segura.";
  }
  if (!create && value.length < 1) return "Escribe tu contraseña.";
  return "";
}

export function validateName(value: string, label: string) {
  const name = value.trim();
  if (!name) return `Escribe tu ${label.toLowerCase()}.`;
  if (name.length < 2) return `${label} debe tener al menos 2 letras.`;
  return "";
}

export function validateOtp(value: string) {
  if (!/^\d{6}$/.test(value)) {
    return "El código tiene 6 dígitos. Revisa el correo o la app autenticadora.";
  }
  return "";
}

export function mapAuthError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("invalid login")) {
    return "Correo o contraseña incorrectos. Si olvidaste la clave, usa “Olvidé mi contraseña”.";
  }
  if (text.includes("email not confirmed")) {
    return "Confirma tu correo con el enlace que te enviamos antes de entrar.";
  }
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo. Entra y, si quieres, vincula Google o Apple desde Configuración.";
  }
  if (text.includes("identity is already linked")) {
    return "Esa cuenta de Google o Apple ya está vinculada a otro usuario.";
  }
  if (text.includes("provider is not enabled") || text.includes("unsupported provider")) {
    return "Ese inicio social aún no está activo en el proyecto. Usa correo y contraseña, o pide activarlo en el panel de Auth.";
  }
  if (text.includes("over_email_send_rate_limit") || text.includes("rate limit")) {
    return "Espera un momento antes de pedir otro código. Así evitamos saturar el correo.";
  }
  if (text.includes("expired") || text.includes("otp_expired")) {
    return "El código ya venció. Pide uno nuevo e introdúcelo enseguida.";
  }
  if (text.includes("invalid") && (text.includes("token") || text.includes("otp"))) {
    return "Ese código no coincide. Revísalo o pide uno nuevo.";
  }
  if (text.includes("same password")) {
    return "Elige una contraseña distinta a la anterior.";
  }
  if (text.includes("leaked") || text.includes("pwned") || text.includes("weak")) {
    return "Esa contraseña es demasiado común o apareció en una filtración. Elige otra.";
  }
  return message;
}
