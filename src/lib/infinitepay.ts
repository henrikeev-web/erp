/**
 * Cliente do Checkout Integrado da InfinitePay (https://www.infinitepay.io/checkout-documentacao).
 * Módulo sem acesso a banco: tudo que é regra de dinheiro aqui é testável (scripts/test-infinitepay.ts).
 *
 * - Valores sempre em CENTAVOS inteiros.
 * - O webhook da InfinitePay NÃO tem assinatura: nunca confie no corpo dele. A prova de pagamento é o
 *   `payment_check` (servidor → InfinitePay), feito em lib/payment-confirm.ts.
 */

const BASE_URL = "https://api.checkout.infinitepay.io";
const TIMEOUT_MS = 10_000;

export interface InfinityPayItem {
  quantity: number;
  price: number; // centavos, por unidade
  description: string;
}

export const toCents = (value: number) => Math.round(value * 100);

/** InfiniteTag: sem o "$" inicial, só letras, números, ponto, hífen e sublinhado. Devolve null se inválida. */
export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim().replace(/^\$/, "");
  return /^[A-Za-z0-9_.-]{2,40}$/.test(h) ? h : null;
}

/**
 * Itens do link de pagamento. A soma TEM que fechar com o total do pedido (frete e desconto inclusos),
 * senão o cliente pagaria um valor diferente do pedido. Sem desconto: um item por linha + o frete.
 * Com desconto (ou se algum arredondamento não fechar): um único item com o total exato.
 */
export function buildCheckoutItems(order: {
  number: number;
  total: number;
  deliveryFee: number;
  discount: number;
  items: { name: string; price: number; quantity: number }[];
}): InfinityPayItem[] {
  const totalCents = toCents(order.total);
  if (order.discount <= 0) {
    const lines: InfinityPayItem[] = order.items.map((i) => ({
      quantity: i.quantity,
      price: toCents(i.price),
      description: i.name.slice(0, 120),
    }));
    if (order.deliveryFee > 0) lines.push({ quantity: 1, price: toCents(order.deliveryFee), description: "Taxa de entrega" });
    const sum = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    if (sum === totalCents) return lines;
  }
  return [{ quantity: 1, price: totalCents, description: `Pedido #${order.number} - Banguelas` }];
}

export interface CreateLinkParams {
  handle: string;
  orderNsu: string; // id do pedido no nosso sistema
  items: InfinityPayItem[];
  customer?: { name: string; email?: string | null; phone?: string | null };
  redirectUrl: string;
  webhookUrl: string;
}

export interface CreateLinkResult {
  url: string;
  slug: string;
}

async function post(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) throw new Error(`InfinitePay ${path} respondeu ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, data };
}

/** A documentação não descreve o corpo da resposta de /links: aceita os nomes plausíveis e falha alto se nenhum vier. */
export function extractLink(data: any): CreateLinkResult {
  const d = data?.data && typeof data.data === "object" ? data.data : data;
  const url = [d?.url, d?.checkout_url, d?.checkoutUrl, d?.link, d?.payment_url, d?.paymentUrl].find((u) => typeof u === "string" && /^https:\/\//.test(u));
  if (!url) throw new Error(`InfinitePay: resposta de /links sem URL de checkout (campos recebidos: ${Object.keys(d ?? {}).join(", ") || "nenhum"})`);
  return { url, slug: String(d?.slug ?? d?.invoice_slug ?? "") };
}

export async function createPaymentLink(p: CreateLinkParams): Promise<CreateLinkResult> {
  const phone = p.customer?.phone?.replace(/\D/g, "");
  const { data } = await post("/links", {
    handle: p.handle,
    order_nsu: p.orderNsu,
    items: p.items,
    redirect_url: p.redirectUrl,
    webhook_url: p.webhookUrl,
    customer: p.customer
      ? {
          name: p.customer.name,
          ...(p.customer.email ? { email: p.customer.email } : {}),
          ...(phone && phone.length >= 10 ? { phone_number: phone.startsWith("55") ? `+${phone}` : `+55${phone}` } : {}),
        }
      : undefined,
  });
  return extractLink(data);
}

export interface PaymentCheck {
  paid: boolean;
  amountCents: number | null;
  paidAmountCents: number | null;
  installments: number | null;
  captureMethod: string | null;
}

const intOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

export async function checkPayment(p: { handle: string; orderNsu: string; transactionNsu: string; slug: string }): Promise<PaymentCheck> {
  const { data } = await post("/payment_check", {
    handle: p.handle,
    order_nsu: p.orderNsu,
    transaction_nsu: p.transactionNsu,
    slug: p.slug,
  });
  return {
    paid: data?.paid === true,
    amountCents: intOrNull(data?.amount),
    paidAmountCents: intOrNull(data?.paid_amount),
    installments: intOrNull(data?.installments),
    captureMethod: typeof data?.capture_method === "string" ? data.capture_method : null,
  };
}

/**
 * Pago de verdade E pelo menos o valor do pedido. Parcelado no cartão pode ter juros (paid_amount maior):
 * isso é aceito; pagar MENOS que o pedido, nunca.
 */
export function isPaymentSufficient(check: PaymentCheck, orderTotal: number): boolean {
  if (!check.paid) return false;
  const received = check.paidAmountCents ?? check.amountCents;
  return received !== null && received >= toCents(orderTotal);
}
