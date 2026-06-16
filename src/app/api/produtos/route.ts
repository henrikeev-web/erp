import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandSlug = searchParams.get("brand") ?? "banguelas";
  const categoryId = searchParams.get("categoria");
  const ageMonths = searchParams.get("idade");
  const featured = searchParams.get("destaque") === "true";

  try {
    const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
    if (!brand) return NextResponse.json({ error: "Marca não encontrada" }, { status: 404 });

    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = {
      brandId: brand.id,
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
  try {
    const body = await req.json();
    const {
      brandId, categoryId, name, description, price, priceOriginal,
      sku, ageMin, ageMax, weight, servings, ingredients, allergens,
      frozen, active, featured, order,
    } = body;

    const product = await prisma.product.create({
      data: {
        brandId, categoryId, name, description, price, priceOriginal,
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
