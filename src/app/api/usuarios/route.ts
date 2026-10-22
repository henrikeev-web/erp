/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { userInputSchema } from "@/lib/franchise";
import { tempPassword } from "@/lib/passwords";

const select = { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true, createdAt: true } as const;

// Usuários do painel da MATRIZ (as franquias têm os seus em /api/franquias/[id]/usuarios).
export async function GET() {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const users = await prisma.user.findMany({ where: { unitId: auth.unit.id }, select, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return NextResponse.json(users);
}

// Cria usuário da matriz. A senha provisória sai UMA vez, nesta resposta, e a pessoa é obrigada a trocá-la no 1º acesso.
export async function POST(req: NextRequest) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const d = userInputSchema.parse(await req.json());
    if (await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } })) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
    const pwd = tempPassword();
    const user = await prisma.user.create({
      data: { name: d.name, email: d.email, role: d.role, unitId: auth.unit.id, passwordHash: await bcrypt.hash(pwd, 10), mustChangePassword: true },
      select,
    });
    return NextResponse.json({ ...user, tempPassword: pwd }, { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
    return NextResponse.json({ error: "Erro ao cadastrar usuário" }, { status: 500 });
  }
}
