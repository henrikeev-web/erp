import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { normalizeHandle } from "@/lib/infinitepay";
import { unitHandle } from "@/lib/payment-link";

export const dynamic = "force-dynamic";

const ADMIN = ["SUPER_ADMIN", "ADMIN"];

// InfiniteTag (InfinitePay) da PRÓPRIA unidade: é a conta que recebe os pagamentos online. Só administrador.
export async function GET() {
  const auth = await requireStaff(ADMIN);
  if (auth instanceof NextResponse) return auth;
  const u = await prisma.unit.findUnique({ where: { id: auth.unit.id }, select: { type: true, infinitepayHandle: true } });
  return NextResponse.json({ handle: u?.infinitepayHandle ?? "", enabled: !!u && unitHandle(u) !== null, usingDefault: !u?.infinitepayHandle && !!u && unitHandle(u) !== null });
}

const schema = z.object({ handle: z.string().trim().max(60) });

export async function PUT(req: NextRequest) {
  const auth = await requireStaff(ADMIN);
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const raw = parsed.data.handle;
  const handle = raw === "" ? null : normalizeHandle(raw);
  if (raw !== "" && !handle) return NextResponse.json({ error: "InfiniteTag inválida: use só letras, números, ponto, hífen ou sublinhado (sem o $)" }, { status: 400 });

  await prisma.unit.update({ where: { id: auth.unit.id }, data: { infinitepayHandle: handle } });
  console.info(`[pagamento] InfiniteTag da unidade ${auth.unit.slug} ${handle ? "alterada" : "removida"} por ${auth.userId}`);
  return NextResponse.json({ handle: handle ?? "", enabled: handle !== null });
}
