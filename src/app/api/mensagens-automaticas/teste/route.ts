import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireHQAdmin } from "@/lib/api-auth";
import { hit, tooManyRequests } from "@/lib/rate-limit";
import { MAX_MESSAGE_LEN, renderMessage, sendWhatsAppText, whatsappNumber } from "@/lib/order-messages";

export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().trim().max(30),
  text: z.string().trim().min(1).max(MAX_MESSAGE_LEN),
  name: z.string().trim().max(60).optional(),
});

// Envia UMA mensagem de teste (o texto que está no formulário) para o número informado. Só admin da matriz.
export async function POST(req: NextRequest) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const rl = hit(`auto-msg-test:${auth.userId}`, 10, 10 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const number = whatsappNumber(parsed.data.phone);
  if (!number) return NextResponse.json({ error: "Telefone inválido (use DDD + número)" }, { status: 400 });

  try {
    await sendWhatsAppText(number, renderMessage(parsed.data.text, parsed.data.name || "Teste"));
  } catch (e) {
    console.warn("[auto-msg] teste falhou:", (e as Error).message);
    return NextResponse.json({ error: `Não enviado: ${(e as Error).message}` }, { status: 502 });
  }
  console.info(`[auto-msg] mensagem de teste enviada por ${auth.userId}`);
  return NextResponse.json({ ok: true });
}
