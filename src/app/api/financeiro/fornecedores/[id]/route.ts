/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { documentSchema } from "@/lib/financeiro";

const ROLES = ["SUPER_ADMIN", "ADMIN"];
const patchSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120).optional(),
  document: documentSchema.optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().email("E-mail inválido").nullable().optional()),
  notes: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const d = patchSchema.parse(await req.json());
    const updated = await prisma.supplier.update({ where: { id, unitId: auth.unit.id }, data: d });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "Já existe fornecedor com este CPF/CNPJ" }, { status: 409 });
    if (e?.code === "P2025") return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

// Com lançamentos vinculados só desativa (preserva o histórico); sem vínculo exclui de fato.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const s = await prisma.supplier.findFirst({ where: { id, unitId: auth.unit.id }, include: { _count: { select: { entries: true, recurringEntries: true } } } });
  if (!s) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });

  if (s._count.entries + s._count.recurringEntries > 0) {
    await prisma.supplier.update({ where: { id, unitId: auth.unit.id }, data: { active: false } });
    return NextResponse.json({ deactivated: true });
  }
  await prisma.supplier.delete({ where: { id, unitId: auth.unit.id } });
  return new NextResponse(null, { status: 204 });
}
