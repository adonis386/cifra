/** Identidad fiscal VE (RIF / cédula). Sin I/O. */

export function normalizeRif(rif: string) {
  return rif.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function validateRif(
  rifRaw: string,
  personType?: "natural" | "juridica" | "any" | string,
): { ok: true; rif: string } | { ok: false; error: string } {
  const rif = normalizeRif(rifRaw);
  if (!rif) {
    return {
      ok: false,
      error:
        personType === "natural"
          ? "Indica la cédula/RIF. Ej: V-12345678-9"
          : "Indica el RIF. Ej: V-12345678-9 o J-12345678-9",
    };
  }
  if (!/^[VEJPGC]\d{6,9}$/.test(rif)) {
    return {
      ok: false,
      error:
        "Formato inválido. Usa V/E (natural) o J/G/C/P (jurídica). Ej: V-12345678-9",
    };
  }
  if (personType === "natural" && !/^[VE]/.test(rif)) {
    return {
      ok: false,
      error: "Persona natural debe empezar con V o E (cédula). Ej: V-12345678-9",
    };
  }
  if (personType === "juridica" && !/^[JGCP]/.test(rif)) {
    return {
      ok: false,
      error: "Persona jurídica debe empezar con J, G, C o P. Ej: J-12345678-9",
    };
  }
  return { ok: true, rif };
}

export function normalizeEmail(email: string) {
  return email.replace(/\s+/g, "").trim().toLowerCase();
}

export function validateEmailOptional(
  emailRaw: string,
): { ok: true; email: string | null } | { ok: false; error: string } {
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: true, email: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Correo inválido. Ej: nombre@gmail.com (sin espacios)" };
  }
  return { ok: true, email };
}
