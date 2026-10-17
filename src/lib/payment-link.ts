/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";
import { buildCheckoutItems, createPaymentLink, normalizeHandle, toCents } from "./infinitepay";

export class PaymentLinkError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type UnitForPay = { type: string; infinitepayHandle?: string | null };

/** InfiniteTag da unidade. A matriz pode usar INFINITEPAY_HANDLE do ambiente enquanto não cadastrar a própria. */
export function unitHandle(unit: UnitForPay): string | null {
  return normalizeHandle(unit.infinitepayHandle) ?? (unit.type === "HQ" ? normalizeHandle(process.env.INFINITEPAY_HANDLE) : null);
}

export async function unitAcceptsOnlinePayment(unitId: string): Promise<boolean> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { type: true, infinitepayHandle: true } });
  return !!unit && unitHandle(unit) !== null;
}

/**
 * Origens públicas. Em produção (BASE_DOMAIN + AUTH_HOST) o webhook vai SEMPRE para o domínio principal
 * (não depende de DNS curinga das franquias); o retorno do cliente volta para o endereço da própria unidade.
 */
export function paymentUrls(unit: { type: string; slug: string }) {
  const base = process.env.BASE_DOMAIN;
  const auth = process.env.AUTH_HOST;
  if (base && auth) {
    const origin = unit.type === "HQ" ? `https://${auth}` : `https://${unit.slug}.${base}`;
    return { redirectUrl: `${origin}/pedido/retorno`, webhookUrl: `https://${auth}/api/pagamentos/webhook` };
  }
  const app = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return { redirectUrl: `${app}/pedido/retorno`, webhookUrl: `${app}/api/pagamentos/webhook` };
}

/** Gera (ou gera de novo) o link de pagamento do pedido e grava em Order.paymentLinkUrl. */
export async function issuePaymentLink(orderId: string, unitId: string): Promise<{ url: string }> {
  const order: any = await prisma.order.findFirst({
    where: { id: orderId, unitId },
    include: { items: true, customer: { select: { name: true, email: true, phone: true } }, payment: true, unit: { select: { type: true, slug: true, infinitepayHandle: true } } },
  });
  if (!order) throw new PaymentLinkError("Pedido não encontrado", 404);
  if (order.status === "CANCELLED") throw new PaymentLinkError("Pedido cancelado", 409);
  if (order.payment?.status === "PAID") throw new PaymentLinkError("Pedido já pago", 409);
  if (toCents(order.total) <= 0) throw new PaymentLinkError("Pedido sem valor a cobrar", 409);

  const handle = unitHandle(order.unit);
  if (!handle) throw new PaymentLinkError("Pagamento online não configurado para esta unidade", 409);

  const { url } = await createPaymentLink({
    handle,
    orderNsu: order.id,
    items: buildCheckoutItems(order),
    customer: order.customer,
    ...paymentUrls(order.unit),
  });
  await prisma.order.update({ where: { id: order.id }, data: { paymentLinkUrl: url } });
  return { url };
}
