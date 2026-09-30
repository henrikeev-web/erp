/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";
import { syncCatalogToUnit } from "./catalog-sync";

/**
 * REPOSIÇÃO: a franquia compra da matriz pelo painel dela. O pedido nasce na MATRIZ (unitId da matriz), em nome do
 * franqueado (Customer FRANCHISEE, `franchiseUnitId`), com preço de franqueado. A matriz atende pelo fluxo normal
 * (confirma, produz, entrega). Ao marcar ENTREGUE, o estoque da franquia é alimentado aqui.
 */

export const NEW_PRODUCT_DAYS = 45;
export const TOP_DAYS = 30;

export async function getHQ(brandId: string) {
  return prisma.unit.findFirst({ where: { brandId, type: "HQ", active: true }, select: { id: true, brandId: true, type: true, name: true, slug: true, active: true } });
}

/** O franqueado da unidade, como cliente da matriz. */
export async function getFranchiseCustomer(franchiseUnitId: string) {
  return prisma.customer.findFirst({ where: { franchiseUnitId, active: true }, select: { id: true, name: true, unitId: true } });
}

/**
 * Entrada no estoque da franquia de um pedido de reposição ENTREGUE. Idempotente: a marca restockedAt é
 * "reivindicada" atomicamente na mesma transação das entradas, então marcar entregue de novo nunca soma duas vezes
 * (e se algo falhar, a marca também é desfeita e dá para repetir).
 */
export async function receiveReplenishment(orderId: string, hqUnitId: string): Promise<{ received: number } | null> {
  const order: any = await prisma.order.findFirst({
    where: { id: orderId, unitId: hqUnitId, priceTier: "FRANCHISE", status: "DELIVERED", restockedAt: null },
    select: { id: true, number: true, customer: { select: { franchiseUnitId: true } }, items: { select: { productId: true, quantity: true } } },
  });
  const franchiseUnitId = order?.customer?.franchiseUnitId;
  if (!order || !franchiseUnitId) return null;

  // Produto que a franquia ainda não tem (novo na matriz): sincroniza o catálogo antes de dar entrada
  const ids = order.items.map((i: any) => i.productId);
  const have = await prisma.product.count({ where: { unitId: franchiseUnitId, sourceProductId: { in: ids } } });
  if (have < new Set(ids).size) await syncCatalogToUnit(hqUnitId, franchiseUnitId);

  return (prisma as any).$transaction(async (tx: any) => {
    const claimed = await tx.order.updateMany({ where: { id: orderId, restockedAt: null }, data: { restockedAt: new Date() } });
    if (claimed.count === 0) return null;

    let received = 0;
    for (const item of order.items) {
      const target = await tx.product.findFirst({ where: { unitId: franchiseUnitId, sourceProductId: item.productId }, select: { id: true } });
      if (!target) throw new Error(`Produto da reposição não encontrado na franquia (${item.productId})`);
      let stock = await tx.stockItem.findUnique({ where: { productId: target.id }, select: { id: true } });
      if (!stock) stock = await tx.stockItem.create({ data: { productId: target.id, quantity: 0, minQuantity: 5 }, select: { id: true } });
      await tx.stockItem.update({ where: { id: stock.id }, data: { quantity: { increment: item.quantity } } });
      await tx.stockMovement.create({ data: { stockItemId: stock.id, type: "IN", quantity: item.quantity, reason: `Reposição — pedido #${order.number} da matriz`, reference: orderId } });
      received += item.quantity;
    }
    return { received };
  });
}
