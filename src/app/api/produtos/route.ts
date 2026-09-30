import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, resolveUnit } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoria");
  const ageMonths = searchParams.get("idade");
  const featured = searchParams.get("destaque") === "true";

  const includeInactive = searchParams.get("includeInactive") === "true";

  // Público (cardápio); includeInactive é só para o painel
  let unitId: string;
  if (includeInactive) {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    unitId = auth.unit.id;
  } else {
    const unit = await resolveUnit();
    if (unit instanceof NextResponse) return unit;
    unitId = unit.id;
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
      include: {
        images: { orderBy: { order: "asc" } },
        category: { select: { id: true, name: true, slug: true } },
        stockItem: { select: { quantity: true, unit: true } },
      },
      orderBy: [{ featured: "desc" }, { order: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(products);
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
      },
      include: { images: true, category: true, stockItem: true },
    });

    if (price !== undefined) {
      await prisma.stockItem.create({
        data: { productId: product.id, quantity: 0, minQuantity: 5 },
      });
    }

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao criar produto" }, { status: 500 });
  }
}
