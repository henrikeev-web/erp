/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { courierSchema } from "@/lib/courier-schema";

export const dynamic = "force-dynamic";
const ADMIN = ["SUPER_ADMIN", "ADMIN"];

// Qualquer staff lista (para escolher no pedido) — mas só ADMIN vê chave PIX e CPF
export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const all = new URL(req.url).searchParams.get("todos") === "true";
  const isAdmin = ADMIN.includes(auth.role);

  const list = await prisma.courier.findMany({
    where: { unitId: auth.unit.id, ...(all && isAdmin ? {} : { active: true }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true, active: true, ...(isAdmin ? { pixKey: true, document: true, notes: true } : {}) },
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(ADMIN);
  if (auth instanceof NextResponse) return auth;
  try {
    const d = courierSchema.parse(await req.json());
    const created = await prisma.courier.create({ data: { ...d, unitId: auth.unit.id } });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "Já existe entregador com este telefone" }, { status: 409 });
    console.error("[entregadores]", e);
    return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
  }
}
