const BASE_URL = "https://api.checkout.infinitepay.io";
const HANDLE = process.env.INFINITEPAY_HANDLE ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export interface InfinityPayItem {
  quantity: number;
  price: number; // in cents
  description: string;
}

export interface CreateLinkParams {
  orderId: string;
  orderNumber: number;
  items: InfinityPayItem[];
  customer?: { name: string; email?: string; phone?: string };
  webhookUrl?: string;
}

export interface CreateLinkResult {
  url: string;
  slug: string;
}

export async function createPaymentLink(params: CreateLinkParams): Promise<CreateLinkResult> {
  const webhookUrl = params.webhookUrl ?? `${APP_URL}/api/pagamentos/webhook`;

  const body = {
    handle: HANDLE,
    order_nsu: params.orderId,
    items: params.items,
    webhook_url: webhookUrl,
    redirect_url: `${APP_URL}/minha-conta/pedidos`,
    customer: params.customer
      ? {
          name: params.customer.name,
          ...(params.customer.email && { email: params.customer.email }),
          ...(params.customer.phone && { phone_number: formatPhone(params.customer.phone) }),
        }
      : undefined,
  };

  const res = await fetch(`${BASE_URL}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`InfinityPay error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // InfinityPay returns the checkout URL — structure may vary; adapt if needed
  return {
    url: data.url ?? data.checkout_url ?? data.link ?? `https://checkout.infinitepay.io/${data.slug ?? ""}`,
    slug: data.slug ?? data.invoice_slug ?? "",
  };
}

export async function checkPayment(params: { orderNsu: string; transactionNsu: string; slug: string }) {
  const res = await fetch(`${BASE_URL}/payment_check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handle: HANDLE,
      order_nsu: params.orderNsu,
      transaction_nsu: params.transactionNsu,
      slug: params.slug,
    }),
  });
  return res.json();
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}
