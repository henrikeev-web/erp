import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

const schema = z.object({ password: z.string().min(8, "Senha com no mínimo 8 caracteres").max(72).optional() });

// Define/redefine a senha de um REVENDEDOR (ou franqueado). Só administrador. Clientes comuns criam a própria senha.
// Sem `password` no corpo, gera uma provisória — devolvida UMA vez nesta resposta, nunca guardada em texto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const customer = await prisma.customer.findFirst({ where: { id, unitId: auth.unit.id }, select: { id: true, type: true } });
  if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (customer.type === "RETAIL") return NextResponse.json({ error: "Só revendedores têm senha definida pelo administrador" }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });

  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const generated = parsed.data.password ? null : Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join("");
  await prisma.customer.update({ where: { id, unitId: auth.unit.id }, data: { passwordHash: await bcrypt.hash(parsed.data.password ?? generated!, 10) } });

  return NextResponse.json({ ok: true, ...(generated ? { tempPassword: generated } : {}) });
}
