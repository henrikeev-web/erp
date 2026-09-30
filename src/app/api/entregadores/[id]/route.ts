/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { courierSchema } from "@/lib/courier-schema";

const ADMIN = ["SUPER_ADMIN", "ADMIN"];
const patchSchema = courierSchema.partial().extend({ active: z.boolean().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ADMIN);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const d = patchSchema.parse(await req.json());
    return NextResponse.json(await prisma.courier.update({ where: { id, unitId: auth.unit.id }, data: d }));
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "Já existe entregador com este telefone" }, { status: 409 });
    if (e?.code === "P2025") return NextResponse.json({ error: "Entregador não encontrado" }, { status: 404 });
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

// Com entregas registradas só desativa (o histórico e o financeiro dependem dele); sem histórico exclui de fato.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ADMIN);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const c = await prisma.courier.findFirst({ where: { id, unitId: auth.unit.id }, include: { _count: { select: { orders: true, entries: true } } } });
  if (!c) return NextResponse.json({ error: "Entregador não encontrado" }, { status: 404 });

  if (c._count.orders + c._count.entries > 0) {
    await prisma.courier.update({ where: { id, unitId: auth.unit.id }, data: { active: false } });
    return NextResponse.json({ deactivated: true });
  }
  await prisma.courier.delete({ where: { id, unitId: auth.unit.id } });
  return new NextResponse(null, { status: 204 });
}
