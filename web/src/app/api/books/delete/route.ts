import { NextResponse } from "next/server";
import { deleteFiscalBookById } from "@/lib/actions/books";

export async function POST(request: Request) {
  let id = "";
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { id?: string };
      id = String(body.id || "");
    } else {
      const form = await request.formData();
      id = String(form.get("id") || "");
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const result = await deleteFiscalBookById(id);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
