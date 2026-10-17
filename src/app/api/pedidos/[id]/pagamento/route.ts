import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { issuePaymentLink, PaymentLinkError } from "@/lib/payment-link";

// Gera ou reenvia o link de pagamento (InfinitePay) de um pedido da unidade
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const { url } = await issuePaymentLink(id, auth.unit.id);
    return NextResponse.json({ paymentLinkUrl: url });
  } catch (e) {
    if (e instanceof PaymentLinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[pagamento] gerar link:", e);
    return NextResponse.json({ error: "Não foi possível gerar o link de pagamento. Tente novamente." }, { status: 502 });
  }
}
