import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, resolveUnit } from "@/lib/api-auth";
import { parseInternalFields } from "@/lib/product-fields";
import { applyTierPricing, getSessionPricing, productOmitFor } from "@/lib/pricing";
import type { PricingTier } from "@/lib/pricing";
import { withComboData } from "@/lib/combo-data";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoria");
  const ageMonths = searchParams.get("idade");
  const featured = searchParams.get("destaque") === "true";

  const includeInactive = searchParams.get("includeInactive") === "true";

  // Público (cardápio); includeInactive é só para o painel
  let unitId: string;
  let tier: PricingTier = "RETAIL";
  if (includeInactive) {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    unitId = auth.unit.id;
  } else {
    const unit = await resolveUnit();
    if (unit instanceof NextResponse) return unit;
    unitId = unit.id;
    tier = (await getSessionPricing(unit.id)).tier; // nível vem da sessão, nunca da query
  }

  try {
    const where: Record<string, unknown> = {
      unitId,
      ...(includeInactive ? {} : { active: true }),
      ...(categoryId && { categoryId }),
      ...(featured && { featured: true }),
    };

    if (ageMonths) {
      const age = parseInt(ageMonths);
      where.AND = [
        { OR: [{ ageMin: null }, { ageMin: { lte: age } }] },
        { OR: [{ ageMax: null }, { ageMax: { gte: age } }] },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      // Dados internos (código de barras, NCM, embalagem) só para o painel
      omit: includeInactive ? undefined : productOmitFor(tier),
      include: {
        images: { orderBy: { order: "asc" } },
        category: { select: { id: true, name: true, slug: true } },
        stockItem: { select: { quantity: true, unit: true } },
      },
      orderBy: [{ featured: "desc" }, { order: "asc" }, { name: "asc" }],
    });

    // Painel (staff) vê tudo; público recebe o preço do seu nível e NUNCA o campo resalePrice
    const shown = includeInactive ? products : products.map((p: any) => applyTierPricing(p, tier));
    return NextResponse.json(await withComboData(unitId, shown as any[]), {
      headers: tier === "RESELLER" ? { "Cache-Control": "private, no-store" } : undefined,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;

  try {
    const body = await req.json();
    const internal = parseInternalFields(body);
    if ("error" in internal) return NextResponse.json({ error: internal.error }, { status: 400 });
    const {
      categoryId, name, description, price, priceOriginal,
      sku, ageMin, ageMax, weight, servings, ingredients, allergens,
      frozen, active, featured, order,
    } = body;

    // A categoria precisa ser da mesma unidade
    if (categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: categoryId, unitId: unit.id }, select: { id: true } });
      if (!cat) return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        brandId: unit.brandId, unitId: unit.id, categoryId, name, description, price, priceOriginal,
        sku, ageMin, ageMax, weight, servings, ingredients, allergens,
        frozen: frozen ?? true, active: active ?? true,
        featured: featured ?? false, order: order ?? 0,
        ...internal.data,
      },
      include: { images: true, category: true, stockItem: true },
    });

    if (price !== undefined) {
      await prisma.stockItem.create({
        data: { productId: product.id, quantity: 0, minQuantity: 5 },
      });
    }

    return NextResponse.json(product, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "SKU ou código de barras já cadastrado" }, { status: 409 });
    console.error(error);
    return NextResponse.json({ error: "Erro ao criar produto" }, { status: 500 });
  }
}
