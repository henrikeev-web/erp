/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { scheduleCatalogSync } from "@/lib/catalog-sync";
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

  const existing = await prisma.product.findFirst({ where: { id, unitId: unit.id, kind: "COMBO" }, select: { id: true, sourceProductId: true, price: true } });
  if (!existing) return NextResponse.json({ error: "Combo não encontrado" }, { status: 404 });

  try {
    const body = await req.json();

    // FRANQUIA: combo da rede tem composição/quantidade definidas pela matriz. A franquia define preço e se vende.
    if (unit.type === "FRANCHISE" && existing.sourceProductId) {
      const price = body.price !== undefined ? Math.round(parseFloat(body.price) * 100) / 100 : undefined;
      if (price !== undefined && !(price > 0)) return NextResponse.json({ error: "Preço inválido" }, { status: 400 });
      const upd = await prisma.product.update({
        where: { id, unitId: unit.id },
        data: { ...(price !== undefined && { price, priceCustom: price !== existing.price ? true : undefined }), ...(typeof body.active === "boolean" && { active: body.active }) },
        include: comboInclude, omit: { resalePrice: true },
      });
      return NextResponse.json(upd);
    }

    const d = comboSchema.parse(body);
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
    scheduleCatalogSync(unit);
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
    scheduleCatalogSync(auth.unit);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Combo não encontrado" }, { status: 404 });
  }
}
