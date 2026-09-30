/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

const ROLES = ["SUPER_ADMIN", "ADMIN"];
const patchSchema = z.object({ name: z.string().trim().min(2, "Nome obrigatório").max(80).optional(), active: z.boolean().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const d = patchSchema.parse(await req.json());
    return NextResponse.json(await prisma.costCenter.update({ where: { id, unitId: auth.unit.id }, data: d }));
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "Já existe um centro de custo com este nome" }, { status: 409 });
    if (e?.code === "P2025") return NextResponse.json({ error: "Centro de custo não encontrado" }, { status: 404 });
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const c = await prisma.costCenter.findFirst({ where: { id, unitId: auth.unit.id }, include: { _count: { select: { entries: true, recurringEntries: true } } } });
  if (!c) return NextResponse.json({ error: "Centro de custo não encontrado" }, { status: 404 });

  if (c._count.entries + c._count.recurringEntries > 0) {
    await prisma.costCenter.update({ where: { id, unitId: auth.unit.id }, data: { active: false } });
    return NextResponse.json({ deactivated: true });
  }
  await prisma.costCenter.delete({ where: { id, unitId: auth.unit.id } });
  return new NextResponse(null, { status: 204 });
}
