/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { comboSchema } from "@/lib/combo-schema";
import { checkCombo, comboInclude } from "@/lib/combo-admin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const combo = await prisma.product.findFirst({ where: { id, unitId: auth.unit.id, kind: "COMBO" }, include: comboInclude, omit: { resalePrice: true } });
  if (!combo) return NextResponse.json({ error: "Combo não encontrado" }, { status: 404 });
  return NextResponse.json(combo);
}

// Edita o combo e SUBSTITUI a composição. Pedidos já feitos não mudam (guardam o que foi escolhido).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;
  const { id } = await params;

  const existing = await prisma.product.findFirst({ where: { id, unitId: unit.id, kind: "COMBO" }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Combo não encontrado" }, { status: 404 });

  try {
    const d = comboSchema.parse(await req.json());
    const bad = await checkCombo(unit.id, d, id);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    const combo = await (prisma as any).$transaction(async (tx: any) => {
      await tx.comboItem.deleteMany({ where: { comboId: id } });
      return tx.product.update({
        where: { id, unitId: unit.id },
        data: {
          comboSize: d.comboSize, name: d.name, description: d.description ?? null, price: d.price, categoryId: d.categoryId ?? null,
          ...(d.active !== undefined && { active: d.active }), ...(d.featured !== undefined && { featured: d.featured }),
          ageMin: d.ageMin ?? null, ageMax: d.ageMax ?? null,
          comboItems: { create: d.items.map((i, idx) => ({ productId: i.productId, maxQty: i.maxQty, order: idx })) },
        },
        include: comboInclude,
        omit: { resalePrice: true },
      });
    });
    return NextResponse.json(combo);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[combos/id]", e);
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

// Desativa (some do cardápio); o histórico de pedidos continua intacto
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    await prisma.product.update({ where: { id, unitId: auth.unit.id, kind: "COMBO" }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Combo não encontrado" }, { status: 404 });
  }
}
