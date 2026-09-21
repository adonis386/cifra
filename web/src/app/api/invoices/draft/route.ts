import { NextResponse } from "next/server";
import { saveInvoiceDraft } from "@/lib/actions/invoices";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await saveInvoiceDraft(formData);
    if (result.error) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el borrador." },
      { status: 400 },
    );
  }
}
