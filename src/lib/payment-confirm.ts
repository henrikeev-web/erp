/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";
import { emitAdminEvent } from "./sse";
import { checkPayment, isPaymentSufficient, toCents } from "./infinitepay";
import { unitHandle } from "./payment-link";

export type ConfirmResult = "PAID" | "ALREADY_PAID" | "NOT_PAID" | "NOT_FOUND" | "ORDER_CANCELLED" | "ERROR";

/**
 * Confirma o pagamento de um pedido SOMENTE depois de perguntar à InfinitePay (payment_check) com o handle da
 * unidade dona do pedido. O que chega no webhook/redirect é apenas uma "dica" de qual pedido consultar.
 * Idempotente: webhook repetido, redirect + webhook ao mesmo tempo, etc. confirmam uma vez só.
 */
export async function confirmOnlinePayment(args: { orderId: string; unitId?: string; transactionNsu: string; slug: string }): Promise<ConfirmResult> {
  const order: any = await prisma.order.findFirst({
    where: { id: args.orderId, ...(args.unitId ? { unitId: args.unitId } : {}) },
    include: { payment: true, customer: { select: { name: true } }, unit: { select: { type: true, infinitepayHandle: true } } },
  });
  if (!order || !order.payment) return "NOT_FOUND";
  if (order.payment.status === "PAID") return "ALREADY_PAID";

  const handle = unitHandle(order.unit);
  if (!handle) { console.error("[pagamento] unidade sem InfiniteTag, pedido", order.id); return "ERROR"; }

  let check;
  try {
    check = await checkPayment({ handle, orderNsu: order.id, transactionNsu: args.transactionNsu, slug: args.slug });
  } catch (e) {
    console.error("[pagamento] payment_check falhou:", e);
    return "ERROR";
  }
  if (!isPaymentSufficient(check, order.total)) {
    if (check.paid) console.error(`[pagamento] pago a MENOS no pedido ${order.id}: recebido ${check.paidAmountCents ?? check.amountCents} centavos, esperado ${toCents(order.total)}`);
    return "NOT_PAID";
  }

  // Pedido cancelado antes do pagamento: o dinheiro entrou, mas o pedido não se reabre. Exige estorno manual.
  if (order.status === "CANCELLED") {
    console.error(`[pagamento] ATENÇÃO: pedido ${order.id} cancelado recebeu pagamento (transação ${args.transactionNsu}). Estornar manualmente.`);
    return "ORDER_CANCELLED";
  }

  const claimed = await (prisma as any).$transaction(async (tx: any) => {
    // Reivindicação atômica: só quem muda PENDING/PROCESSING → PAID segue adiante
    const r = await tx.payment.updateMany({
      where: { orderId: order.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: {
        status: "PAID",
        paidAt: new Date(),
        gatewayId: args.transactionNsu,
        gatewayData: { slug: args.slug, paidAmount: check.paidAmountCents, amount: check.amountCents, installments: check.installments, captureMethod: check.captureMethod },
      },
    });
    if (r.count === 0) return false;
    await tx.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    return true;
  });
  if (!claimed) return "ALREADY_PAID";

  emitAdminEvent({ unitId: order.unitId, type: "order_confirmed", orderId: order.id, orderNumber: order.number, customerName: order.customer.name });
  return "PAID";
}
