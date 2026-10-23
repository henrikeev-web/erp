import { prisma } from "@/lib/prisma";

/**
 * Ids dos pedidos que são o 1º pedido do cliente (nenhum pedido anterior não cancelado).
 * Calculado na hora a partir do histórico — não depende de campo gravado.
 */
export async function firstOrderIds(orders: { id: string; customerId: string; createdAt: Date }[]): Promise<Set<string>> {
  if (orders.length === 0) return new Set();
  const earliest = await prisma.order.groupBy({
    by: ["customerId"],
    where: { customerId: { in: [...new Set(orders.map((o) => o.customerId))] }, status: { not: "CANCELLED" } },
    _min: { createdAt: true },
  });
  const minByCustomer = new Map(earliest.map((e) => [e.customerId, e._min.createdAt]));
  return new Set(
    orders
      .filter((o) => {
        const min = minByCustomer.get(o.customerId);
        return !min || o.createdAt <= min;
      })
      .map((o) => o.id),
  );
}
