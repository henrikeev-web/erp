/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { userInputSchema } from "@/lib/franchise";
import { tempPassword } from "@/lib/passwords";

// Novo usuário para o painel da franquia. A senha provisória sai UMA vez, nesta resposta.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const unit = await prisma.unit.findFirst({ where: { id, brandId: auth.unit.brandId, type: "FRANCHISE" }, select: { id: true } });
  if (!unit) return NextResponse.json({ error: "Franquia não encontrada" }, { status: 404 });

  try {
    const d = userInputSchema.parse(await req.json());
    if (await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } })) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
    const pwd = tempPassword();
    const user = await prisma.user.create({ data: { name: d.name, email: d.email, role: d.role, unitId: id, passwordHash: await bcrypt.hash(pwd, 10) }, select: { id: true, name: true, email: true, role: true, active: true } });
    return NextResponse.json({ ...user, tempPassword: pwd }, { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
    return NextResponse.json({ error: "Erro ao cadastrar usuário" }, { status: 500 });
  }
}
