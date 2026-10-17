export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmOnlinePayment } from "@/lib/payment-confirm";

// A InfinitePay chama aqui quando o pagamento é aprovado. O webhook NÃO é assinado: o corpo é só uma indicação
// de qual pedido consultar. Quem confirma é o payment_check (lib/payment-confirm.ts), nunca o que veio no corpo.
// 200 = recebido (não repetir); 400 = não consegui confirmar (a InfinitePay tenta de novo).
const schema = z.object({
  order_nsu: z.string().min(1).max(64),
  transaction_nsu: z.string().min(1).max(128),
  invoice_slug: z.string().min(1).max(128).optional(),
  slug: z.string().min(1).max(128).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  const slug = parsed.success ? (parsed.data.invoice_slug ?? parsed.data.slug) : undefined;
  if (!parsed.success || !slug) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const result = await confirmOnlinePayment({ orderId: parsed.data.order_nsu, transactionNsu: parsed.data.transaction_nsu, slug });

  switch (result) {
    case "PAID":
    case "ALREADY_PAID":
    case "ORDER_CANCELLED": // já registrado no log para estorno; repetir não adianta
      return NextResponse.json({ ok: true });
    case "NOT_FOUND":
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    default:
      return NextResponse.json({ error: "Pagamento não confirmado" }, { status: 400 });
  }
}
