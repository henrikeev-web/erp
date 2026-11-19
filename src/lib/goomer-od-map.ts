// Conversão pura (sem banco) de um pedido Open Delivery do Goomer para os dados do ERP.
// Teste: npx tsx scripts/test-goomer-od.ts

export type OdMoney = { value: number; currency?: string };
export type OdItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice?: OdMoney;
  totalPrice?: OdMoney;
  externalCode?: string;
  specialInstructions?: string;
  options?: { name?: string; quantity?: number; unitPrice?: OdMoney; totalPrice?: OdMoney }[];
};
export type OdOrder = {
  id: string;
  type?: string; // DELIVERY | TAKEOUT | INDOOR
  displayId?: string;
  createdAt: string;
  merchant?: { id?: string; name?: string };
  items: OdItem[];
  total?: { discount?: OdMoney; otherFees?: OdMoney; itemsPrice?: OdMoney; orderAmount?: OdMoney };
  otherFees?: { name?: string; type?: string; price?: OdMoney }[];
  customer?: { id?: string; name?: string; email?: string; phone?: { number?: string } };
  delivery?: {
    deliveryAddress?: {
      street?: string; number?: string; complement?: string; district?: string;
      city?: string; state?: string; postalCode?: string; reference?: string;
    };
  };
  payments?: {
    prepaid?: number;
    pending?: number;
    methods?: { type?: string; method?: string; brand?: string; value?: number; changeFor?: number }[];
  };
};

export type PaymentMethodErp = "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "VOUCHER" | "ONLINE_CREDIT" | "ONLINE_PIX";

export const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const money = (m?: OdMoney) => round2(m?.value ?? 0);
const clip = (s: unknown, max: number) => {
  const t = String(s ?? "").replace(/\0/g, "").trim();
  return t ? t.slice(0, max) : undefined;
};

/** Telefone só com dígitos e sem o 55 (mesma regra do importador do histórico). */
export const phoneDigits = (p?: string) => (p ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");

/** Normalização de nome de produto (igual à do importador do histórico). */
export const normName = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[*"'“”-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Remove marcas de promoção/quantidade que o Goomer coloca no nome. */
export const stripMarks = (s: string) =>
  s
    .replace(/^(promocao|promo)!*\s+/, "")
    .replace(/^(apenas\s+)?\d+\s+(unidades|unids?)\s+/, "")
    .replace(/\s+promo!*$/, "")
    .trim();

export function mapPayment(o: OdOrder): { method: PaymentMethodErp; prepaid: boolean; changeFor: number | null; brand?: string } {
  const m = o.payments?.methods?.[0];
  const prepaid = (m?.type ?? "").toUpperCase() === "PREPAID" || ((o.payments?.prepaid ?? 0) > 0 && !(o.payments?.pending ?? 0));
  const kind = (m?.method ?? "").toUpperCase();
  let method: PaymentMethodErp;
  if (prepaid) method = kind === "PIX" ? "ONLINE_PIX" : "ONLINE_CREDIT";
  else if (kind === "CREDIT") method = "CREDIT_CARD";
  else if (kind === "DEBIT") method = "DEBIT_CARD";
  else if (kind === "PIX") method = "PIX";
  else if (["MEAL_VOUCHER", "FOOD_VOUCHER", "VOUCHER"].includes(kind)) method = "VOUCHER";
  else method = "CASH";
  const changeFor = m?.changeFor && m.changeFor > 0 ? round2(m.changeFor) : null;
  return { method, prepaid, changeFor, brand: clip(m?.brand, 40) };
}

export type MappedOrder = {
  externalId: string;
  type: "DELIVERY" | "PICKUP";
  createdAt: Date;
  displayId?: string;
  phone: string;
  customerName: string;
  customerEmail?: string;
  address: null | { cep: string; street: string; number: string; complement?: string; neighborhood: string; city: string; state: string };
  items: { name: string; quantity: number; price: number; total: number; notes?: string }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  notes: string;
  payment: ReturnType<typeof mapPayment>;
};

export function mapOrder(o: OdOrder): MappedOrder {
  if (!o?.id || !Array.isArray(o.items)) throw new Error("Pedido Open Delivery sem id ou itens");
  const createdAt = new Date(o.createdAt);
  if (Number.isNaN(createdAt.getTime())) throw new Error(`Pedido ${o.id}: createdAt inválido`);

  const items = o.items.map((i) => {
    const quantity = Math.max(1, Math.round(Number(i.quantity) || 1));
    const total = i.totalPrice ? money(i.totalPrice) : round2(money(i.unitPrice) * quantity);
    const opts = (i.options ?? []).map((op) => `${op.quantity && op.quantity > 1 ? `${op.quantity}x ` : ""}${op.name ?? ""}`.trim()).filter(Boolean);
    const notes = [opts.length ? `+ ${opts.join(", ")}` : "", clip(i.specialInstructions, 300) ?? ""].filter(Boolean).join(" · ");
    return { name: clip(i.name, 200) ?? "Item Goomer", quantity, price: round2(total / quantity), total, notes: notes || undefined };
  });

  const subtotal = o.total?.itemsPrice ? money(o.total.itemsPrice) : round2(items.reduce((s, i) => s + i.total, 0));
  const fees = o.otherFees ?? [];
  const deliveryFee = fees.length
    ? round2(fees.filter((f) => (f.type ?? "").toUpperCase() === "DELIVERY_FEE").reduce((s, f) => s + money(f.price), 0))
    : money(o.total?.otherFees);
  const extraFees = fees.filter((f) => (f.type ?? "").toUpperCase() !== "DELIVERY_FEE" && money(f.price) > 0);
  const discount = money(o.total?.discount);
  const total = o.total?.orderAmount ? money(o.total.orderAmount) : round2(subtotal + deliveryFee - discount);

  const a = o.delivery?.deliveryAddress;
  const isDelivery = (o.type ?? "DELIVERY").toUpperCase() === "DELIVERY";
  const cep = (a?.postalCode ?? "").replace(/\D/g, "");
  const address =
    isDelivery && a?.street && cep
      ? {
          cep: cep.slice(0, 8),
          street: clip(a.street, 200)!,
          number: clip(a.number, 20) ?? "S/N",
          complement: clip([a.complement, a.reference ? `Ref.: ${a.reference}` : ""].filter(Boolean).join(" · "), 200),
          neighborhood: clip(a.district, 120) ?? "-",
          city: clip(a.city, 120) ?? "-",
          state: (clip(a.state, 2) ?? "SP").toUpperCase(),
        }
      : null;

  const payment = mapPayment(o);
  const notes = [
    `Goomer ${o.displayId ?? ""}`.trim() + " (tempo real)",
    payment.changeFor ? `Troco para R$ ${payment.changeFor.toFixed(2).replace(".", ",")}` : "",
    extraFees.length ? `Outras taxas: ${extraFees.map((f) => `${f.name ?? f.type} R$ ${money(f.price).toFixed(2).replace(".", ",")}`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    externalId: String(o.id).slice(0, 100),
    type: isDelivery ? "DELIVERY" : "PICKUP",
    createdAt,
    displayId: clip(o.displayId, 20),
    phone: phoneDigits(o.customer?.phone?.number),
    customerName: clip(o.customer?.name, 120) ?? "Cliente Goomer",
    customerEmail: clip(o.customer?.email, 200)?.toLowerCase(),
    address,
    items,
    subtotal,
    deliveryFee,
    discount,
    total,
    notes,
    payment,
  };
}
