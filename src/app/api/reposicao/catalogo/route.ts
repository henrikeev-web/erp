/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFranchiseAdmin } from "@/lib/api-auth";
import { getHQ, NEW_PRODUCT_DAYS } from "@/lib/replenishment";

export const dynamic = "force-dynamic";

// Catálogo da matriz para a franquia pedir reposição: preço DE FRANQUEADO (franchisePrice → revenda → normal),
// estoque da matriz e o estoque atual da própria franquia. Só o administrador da franquia enxerga estes preços.
export async function GET() {
  const auth = await requireFranchiseAdmin();
  if (auth instanceof NextResponse) return auth;
  const hq = await getHQ(auth.unit.brandId);
  if (!hq) return NextResponse.json({ error: "Matriz não encontrada" }, { status: 404 });

  const [products, mine]: [any[], any[]] = await Promise.all([
    prisma.product.findMany({
      where: { unitId: hq.id, active: true, kind: "SIMPLE" },
      orderBy: [{ category: { order: "asc" } }, { name: "asc" }],
      include: { category: { select: { id: true, name: true } }, images: { where: { isMain: true }, take: 1, select: { url: true } }, stockItem: { select: { quantity: true } } },
      omit: { barcode: true, ncm: true, packWeightG: true, packLengthCm: true, packWidthCm: true, packHeightCm: true },
    }),
    prisma.product.findMany({ where: { unitId: auth.unit.id, sourceProductId: { not: null } }, select: { sourceProductId: true, stockItem: { select: { quantity: true } } } }),
  ]);
  const myStock = new Map<string, number>(mine.map((p) => [p.sourceProductId, p.stockItem?.quantity ?? 0]));
  const since = Date.now() - NEW_PRODUCT_DAYS * 86_400_000;

  return NextResponse.json(products.map((p) => {
    const stock = p.stockItem ? p.stockItem.quantity : null;
    return {
      id: p.id, name: p.name, description: p.description, category: p.category?.name ?? null, imageUrl: p.images[0]?.url ?? null,
      unitPrice: p.franchisePrice ?? p.resalePrice ?? p.price,
      stock, soldOut: stock !== null && stock <= 0,
      myStock: myStock.get(p.id) ?? null,
      isNew: p.createdAt.getTime() >= since,
    };
  }));
}
