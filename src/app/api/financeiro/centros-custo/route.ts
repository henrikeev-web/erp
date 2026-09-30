/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
const ROLES = ["SUPER_ADMIN", "ADMIN"];
const schema = z.object({ name: z.string().trim().min(2, "Nome obrigatório").max(80) });

export async function GET(req: NextRequest) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const all = new URL(req.url).searchParams.get("todos") === "true";
  const list = await prisma.costCenter.findMany({ where: { unitId: auth.unit.id, ...(all ? {} : { active: true }) }, orderBy: { name: "asc" } });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    const d = schema.parse(await req.json());
    return NextResponse.json(await prisma.costCenter.create({ data: { ...d, unitId: auth.unit.id } }), { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "Já existe um centro de custo com este nome" }, { status: 409 });
    return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
  }
}
