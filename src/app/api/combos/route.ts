/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { comboSchema } from "@/lib/combo-schema";
import { checkCombo, comboInclude } from "@/lib/combo-admin";

export const dynamic = "force-dynamic";

// Lista de combos do painel (ativos e inativos), com a composição e o estoque de cada produto
export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const combos = await prisma.product.findMany({
    where: { unitId: auth.unit.id, kind: "COMBO" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: comboInclude,
    omit: { resalePrice: true, barcode: true, ncm: true, packWeightG: true, packLengthCm: true, packWidthCm: true, packHeightCm: true },
  });
  return NextResponse.json(combos);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;
  try {
    const d = comboSchema.parse(await req.json());
    const bad = await checkCombo(unit.id, d);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    // Combo não tem StockItem (o estoque é dos produtos que o compõem) nem preço de revenda
    const combo = await prisma.product.create({
      data: {
        unitId: unit.id, brandId: unit.brandId, kind: "COMBO", comboSize: d.comboSize,
        name: d.name, description: d.description ?? null, price: d.price, categoryId: d.categoryId ?? null,
        active: d.active ?? true, featured: d.featured ?? false, ageMin: d.ageMin ?? null, ageMax: d.ageMax ?? null, frozen: true,
        comboItems: { create: d.items.map((i, idx) => ({ productId: i.productId, maxQty: i.maxQty, order: idx })) },
      },
      include: comboInclude,
      omit: { resalePrice: true },
    });
    return NextResponse.json(combo, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[combos]", e);
    return NextResponse.json({ error: "Erro ao salvar combo" }, { status: 500 });
  }
}
