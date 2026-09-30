import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { resolveUnit } from "@/lib/api-auth";

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  const unit = await resolveUnit();
  if (unit instanceof NextResponse) return unit;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const { name, phone, email, password } = parsed.data;
    const phoneClean = phone.replace(/\D/g, "");
    const emailValue = email && email.trim() !== "" ? email.trim() : null;
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await prisma.customer.findFirst({
      where: { unitId: unit.id, OR: [{ phone: phoneClean }, ...(emailValue ? [{ email: emailValue }] : [])] },
    });

    if (existing) {
      // Revendedor/franqueado é cadastrado só pelo admin: o autocadastro jamais assume essa conta
      // (mesma resposta de "conta existente" para não revelar que o telefone é de um revendedor)
      if (existing.passwordHash || existing.type !== "RETAIL") {
        return NextResponse.json({ error: "Conta já cadastrada. Use a opção de entrar." }, { status: 409 });
      }
      // Customer exists from anonymous checkout — activate account
      await (prisma.customer as any).update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          ...(emailValue && !existing.email ? { email: emailValue } : {}),
        },
      });
      return NextResponse.json({ ok: true, activated: true });
    }

    // New customer
    await (prisma as any).$transaction(async (tx: any) => {
      const customer = await tx.customer.create({
        data: {
          brandId: unit.brandId,
          unitId: unit.id,
          name,
          phone: phoneClean,
          email: emailValue,
          passwordHash,
        },
      });
      await tx.loyaltyCard.create({ data: { customerId: customer.id } });
    });

    return NextResponse.json({ ok: true, activated: false });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Telefone ou e-mail já cadastrado." }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
