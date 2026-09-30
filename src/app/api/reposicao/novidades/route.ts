/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFranchiseAdmin } from "@/lib/api-auth";
import { getHQ, NEW_PRODUCT_DAYS, TOP_DAYS } from "@/lib/replenishment";

export const dynamic = "force-dynamic";

// Lançamentos da matriz e "mais pedidos pelas outras franquias". As outras franquias NÃO são identificadas:
// só o produto e quantas franquias diferentes pediram.
export async function GET() {
  const auth = await requireFranchiseAdmin();
  if (auth instanceof NextResponse) return auth;
  const hq = await getHQ(auth.unit.brandId);
  if (!hq) return NextResponse.json({ lancamentos: [], maisPedidos: [] });

  const newSince = new Date(Date.now() - NEW_PRODUCT_DAYS * 86_400_000);
  const topSince = new Date(Date.now() - TOP_DAYS * 86_400_000);

  const [lancamentos, items]: [any[], any[]] = await Promise.all([
    prisma.product.findMany({
      where: { unitId: hq.id, active: true, kind: "SIMPLE", createdAt: { gte: newSince } },
      orderBy: { createdAt: "desc" }, take: 12,
      select: { id: true, name: true, description: true, createdAt: true, franchisePrice: true, resalePrice: true, price: true, images: { where: { isMain: true }, take: 1, select: { url: true } } },
    }),
    prisma.orderItem.findMany({
      where: { order: { unitId: hq.id, priceTier: "FRANCHISE", status: { not: "CANCELLED" }, createdAt: { gte: topSince }, customer: { franchiseUnitId: { not: auth.unit.id } } } },
      select: { productId: true, name: true, quantity: true, order: { select: { customer: { select: { franchiseUnitId: true } } } }, product: { select: { active: true, images: { where: { isMain: true }, take: 1, select: { url: true } } } } },
    }),
  ]);

  const agg = new Map<string, { productId: string; name: string; imageUrl: string | null; active: boolean; qty: number; franchises: Set<string> }>();
  for (const i of items) {
    const a = agg.get(i.productId) ?? { productId: i.productId, name: i.name, imageUrl: i.product?.images[0]?.url ?? null, active: !!i.product?.active, qty: 0, franchises: new Set<string>() };
    a.qty += i.quantity; a.franchises.add(i.order.customer.franchiseUnitId);
    agg.set(i.productId, a);
  }
  const maisPedidos = [...agg.values()].filter((a) => a.active).sort((a, b) => b.franchises.size - a.franchises.size || b.qty - a.qty).slice(0, 8)
    .map((a) => ({ productId: a.productId, name: a.name, imageUrl: a.imageUrl, franquias: a.franchises.size, quantidade: a.qty }));

  return NextResponse.json({
    lancamentos: lancamentos.map((p) => ({ id: p.id, name: p.name, description: p.description, createdAt: p.createdAt, imageUrl: p.images[0]?.url ?? null, unitPrice: p.franchisePrice ?? p.resalePrice ?? p.price })),
    maisPedidos,
  });
}
