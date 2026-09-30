import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUnit } from "@/lib/unit";

const schema = z.object({
  phone: z.string().min(10),
  name: z.string().min(2).optional(),
});

// Primeiro acesso com Google: falta o telefone (obrigatório e único por unidade).
// Só quem tem sessão PENDENTE da unidade do host chega aqui; identidade/e-mail vêm do token, não do corpo.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const unit = await getCurrentUnit();
  const u = session?.user;
  if (!u || u.role !== "CUSTOMER_PENDING" || !unit || u.unitId !== unit.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  // googleId e e-mail verificado ficam no JWT; recuperamos via token de sessão no servidor
  const { getToken } = await import("next-auth/jwt");
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const cookieName = process.env.COOKIE_DOMAIN ? "__Secure-next-auth.session-token" : "next-auth.session-token";
  const token = await getToken({ req: { cookies: Object.fromEntries(jar.getAll().map((c) => [c.name, c.value])), headers: {} } as never, cookieName });
  const googleId = token?.googleId;
  if (!googleId || !u.email) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const phone = parsed.data.phone.replace(/\D/g, "");
  if (phone.length < 10) return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });

  const existing = await prisma.customer.findFirst({ where: { unitId: unit.id, phone } });
  if (existing) {
    // Conta já ativada (senha ou outro Google): não dá para "assumir" pelo telefone
    if (existing.passwordHash || existing.googleId) {
      return NextResponse.json({ error: "Este telefone já tem conta. Entre com sua senha." }, { status: 409 });
    }
    // Cadastro criado só por compra como visitante: vincula ao Google (mesmo fluxo do register)
    await prisma.customer.update({
      where: { id: existing.id },
      data: { googleId, ...(existing.email ? {} : { email: u.email }), ...(parsed.data.name ? { name: parsed.data.name } : {}) },
    });
    return NextResponse.json({ customerId: existing.id });
  }

  try {
    const customer = await (prisma as any).$transaction(async (tx: any) => {
      const c = await tx.customer.create({
        data: {
          brandId: unit.brandId,
          unitId: unit.id,
          name: parsed.data.name ?? u.name ?? phone,
          phone,
          email: u.email,
          googleId,
        },
      });
      await tx.loyaltyCard.create({ data: { customerId: c.id } });
      return c;
    });
    return NextResponse.json({ customerId: customer.id }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Telefone ou e-mail já cadastrado." }, { status: 409 });
    console.error("[google/completar]", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
