/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";
import { createPaymentLink } from "./infinitepay";
import { emitAdminEvent } from "./sse";
import { addDaysUTC, todayUTC } from "./financeiro";
import { validatePicks } from "./combo";
import type { ComboOption, ComboPick } from "./combo";

/**
 * Criação de pedido — ponto único usado pelo checkout público, WhatsApp e (futuramente)
 * pedido manual do painel e combos. Toda validação de posse (unidade) acontece aqui:
 * cliente, endereço, zona, produtos e cupom precisam pertencer à unidade do pedido.
 */

export class OrderError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type OrderSource = "STOREFRONT" | "WHATSAPP" | "ADMIN";

export interface CreateOrderInput {
  unit: { id: string; brandId: string };
  customerId: string;
  addressId?: string;
  deliveryZoneId?: string;
  type?: "DELIVERY" | "PICKUP" | "DINE_IN";
  notes?: string;
  couponCode?: string;
  scheduledTo?: Date;
  paymentMethod: string;
  changeAmount?: number;
  /** Combo: `combo` traz o que o cliente escolheu (por unidade do combo); a soma precisa ser exatamente o tamanho do combo. */
  items: { productId: string; quantity: number; notes?: string; combo?: ComboPick[] }[];
  source: OrderSource;

  /**
   * Nível de preço. O storefront passa o nível da SESSÃO; o WhatsApp sempre RETAIL. BY_CUSTOMER só p/ fluxos
   * do painel (o operador escolhe o cliente e o preço acompanha o tipo dele). RESELLER exige cliente revendedor.
   */
  pricing?: "RETAIL" | "RESELLER" | "BY_CUSTOMER";
  /** Faturado (paymentMethod INVOICE): prazo em dias, contado da data do pedido. */
  invoiceDays?: number;
  /** Desconto do operador sobre o pedido INTEIRO (itens + frete). PERCENT: 0 < x ≤ 100. VALUE: ≤ total. */
  manualDiscount?: { type: "PERCENT" | "VALUE"; amount: number; note?: string };
  /** Pedido manual já entra em produção. */
  initialStatus?: "PENDING" | "CONFIRMED" | "IN_PRODUCTION";
  /** Marca o pagamento como recebido na criação (balcão). Ignorado em INVOICE. */
  markPaid?: boolean;
  createdBy?: string;
  /** Entregador (só pedido de ENTREGA). Obrigatório quando o pedido já nasce em produção. */
  courierId?: string;
}

const PAY_ON_DELIVERY = ["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "VOUCHER"];
const ONLINE = ["ONLINE_PIX", "ONLINE_CREDIT", "ONLINE_BOLETO"];
const SOURCE_LABEL: Record<OrderSource, string> = { STOREFRONT: "Pedido", WHATSAPP: "WhatsApp", ADMIN: "Pedido manual" };

// Dois pedidos simultâneos podem calcular o mesmo número; a unicidade [unitId, number]
// derruba um deles. A transação inteira (cupom e estoque inclusos) é desfeita, então repetir é seguro.
async function retryOnNumberConflict<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const target = JSON.stringify(e?.meta ?? "");
      if (e?.code === "P2002" && target.includes("number") && i < attempts) continue;
      throw e;
    }
  }
}

export async function createOrder(input: CreateOrderInput) {
  const { unit } = input;
  if (input.items.length === 0) throw new OrderError("Pedido sem itens");

  // Produto simples repetido vira uma linha só. Combo NÃO funde: cada combo é uma linha própria, com a sua escolha.
  const qtyByProduct = new Map<string, number>();
  const notesByProduct = new Map<string, string | undefined>();
  const comboLines: { productId: string; quantity: number; notes?: string; picks: ComboPick[] }[] = [];
  for (const it of input.items) {
    if (it.combo) {
      comboLines.push({ productId: it.productId, quantity: it.quantity, notes: it.notes, picks: it.combo });
      continue;
    }
    qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + it.quantity);
    if (it.notes) notesByProduct.set(it.productId, it.notes);
  }

  const order: any = await retryOnNumberConflict<any>(() => (prisma as any).$transaction(async (tx: any) => {
    // ── Posse: tudo precisa ser da unidade ────────────────────────────────
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, unitId: unit.id, active: true } });
    if (!customer) throw new OrderError("Cliente não encontrado", 404);

    if (input.addressId) {
      const addr = await tx.customerAddress.findFirst({ where: { id: input.addressId, customerId: customer.id }, select: { id: true } });
      if (!addr) throw new OrderError("Endereço inválido");
    }

    let zone: any = null;
    if (input.deliveryZoneId) {
      zone = await tx.deliveryZone.findFirst({ where: { id: input.deliveryZoneId, unitId: unit.id, active: true } });
      if (!zone) throw new OrderError("Zona de entrega inválida");
    }

    const products = await tx.product.findMany({
      where: { id: { in: [...new Set([...qtyByProduct.keys(), ...comboLines.map((c) => c.productId)])] }, unitId: unit.id, active: true },
      include: {
        stockItem: true,
        // Composição do combo com o estoque de cada produto (só usada em produtos COMBO)
        comboItems: { orderBy: { order: "asc" }, include: { product: { include: { stockItem: true } } } },
      },
    });
    const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

    // ── Nível de preço (decidido no servidor; ver src/lib/pricing.ts) ─────
    const requested = input.pricing ?? "RETAIL";
    const tier: "RETAIL" | "RESELLER" = requested === "BY_CUSTOMER" ? (customer.type === "RESELLER" ? "RESELLER" : "RETAIL") : requested;
    if (tier === "RESELLER" && customer.type !== "RESELLER") throw new OrderError("Preço de revenda indisponível", 403);
    if (tier === "RESELLER" && input.couponCode) throw new OrderError("Cupom não se aplica a pedidos de revenda");
    if (input.paymentMethod === "INVOICE" && customer.type === "RETAIL") throw new OrderError("Faturamento indisponível para este cliente", 403);
    const invoiceDays = input.paymentMethod === "INVOICE" ? input.invoiceDays : undefined;
    if (input.paymentMethod === "INVOICE" && !(Number.isInteger(invoiceDays) && invoiceDays! >= 1 && invoiceDays! <= 120)) {
      throw new OrderError("Informe o prazo do faturamento (1 a 120 dias)");
    }

    // ── Itens e subtotal (preço sempre do servidor) ───────────────────────
    let subtotal = 0;
    type Line = { productId: string; name: string; price: number; quantity: number; total: number; notes?: string; components?: { productId: string; name: string; quantity: number }[] };
    const orderItems: Line[] = [...qtyByProduct.entries()].map(([productId, quantity]) => {
      const p = productMap.get(productId);
      if (!p) throw new OrderError("Produto indisponível");
      if (p.kind === "COMBO") throw new OrderError(`Monte o combo "${p.name}" escolhendo os itens`);
      // Revenda: preço fixo do produto; sem preço de revenda cadastrado, vale o preço normal
      const unitPrice = tier === "RESELLER" ? (p.resalePrice ?? p.price) : p.price;
      const total = Math.round(unitPrice * quantity * 100) / 100;
      subtotal += total;
      return { productId, name: p.name, price: unitPrice, quantity, total, notes: notesByProduct.get(productId) };
    });

    // Combos: preço FIXO do combo (não há preço de revenda para combo); a escolha é validada no servidor
    for (const c of comboLines) {
      const p = productMap.get(c.productId);
      if (!p) throw new OrderError("Combo indisponível");
      if (p.kind !== "COMBO" || !p.comboSize) throw new OrderError(`"${p.name}" não é um combo`);
      const options: ComboOption[] = p.comboItems.map((ci: any) => ({
        productId: ci.productId, name: ci.product.name, maxQty: ci.maxQty,
        active: ci.product.active && ci.product.unitId === unit.id,
        stock: ci.product.stockItem ? ci.product.stockItem.quantity : null,
      }));
      const v = validatePicks(options, p.comboSize, c.picks);
      if ("error" in v) throw new OrderError(`${p.name}: ${v.error}`);
      const total = Math.round(p.price * c.quantity * 100) / 100;
      subtotal += total;
      orderItems.push({
        productId: p.id, name: p.name, price: p.price, quantity: c.quantity, total, notes: c.notes,
        components: v.picks.map((pk) => ({ productId: pk.productId, name: options.find((o) => o.productId === pk.productId)!.name, quantity: pk.quantity * c.quantity })),
      });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    // ── Entregador: custo conforme a região, gravado no pedido (não muda se a zona for reajustada) ──
    const isDelivery = (input.type ?? "DELIVERY") === "DELIVERY";
    let courierId: string | undefined;
    let courierFee: number | undefined;
    if (input.courierId) {
      if (!isDelivery) throw new OrderError("Entregador só se aplica a pedidos de entrega");
      const courier = await tx.courier.findFirst({ where: { id: input.courierId, unitId: unit.id, active: true }, select: { id: true } });
      if (!courier) throw new OrderError("Entregador inválido");
      courierId = courier.id;
      courierFee = zone?.courierFee ?? 0;
    } else if (isDelivery && input.initialStatus && input.initialStatus !== "PENDING") {
      throw new OrderError("Selecione o entregador para pedidos de entrega em produção");
    }

    // ── Frete ─────────────────────────────────────────────────────────────
    let deliveryFee = 0;
    if (input.type !== "PICKUP" && zone) {
      if (subtotal < zone.minOrder) throw new OrderError(`Pedido mínimo de R$ ${zone.minOrder.toFixed(2)} para esta zona`);
      deliveryFee = zone.freeAbove && subtotal >= zone.freeAbove ? 0 : zone.fee;
    }

    // ── Cupom (validado e consumido dentro da transação) ──────────────────
    let discount = 0;
    let couponId: string | undefined;
    if (input.couponCode) {
      const now = new Date();
      const coupon = await tx.coupon.findFirst({
        where: {
          unitId: unit.id,
          code: input.couponCode.toUpperCase().trim(),
          active: true,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        },
      });
      if (!coupon) throw new OrderError("Cupom inválido ou expirado");
      if (subtotal < coupon.minOrder) throw new OrderError(`Pedido mínimo de R$ ${coupon.minOrder.toFixed(2)} para este cupom`);
      if (coupon.firstOrderOnly && (await tx.order.count({ where: { customerId: customer.id, status: { not: "CANCELLED" } } })) > 0) {
        throw new OrderError("Cupom válido apenas no primeiro pedido");
      }

      if (coupon.type === "PERCENTAGE") discount = (subtotal * coupon.value) / 100;
      else if (coupon.type === "FIXED") discount = coupon.value;
      else if (coupon.type === "FREE_DELIVERY") deliveryFee = 0;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
      discount = Math.min(discount, subtotal);

      // Atômico: só incrementa se ainda houver usos disponíveis
      const claimed = await tx.coupon.updateMany({
        where: { id: coupon.id, ...(coupon.maxUses ? { usedCount: { lt: coupon.maxUses } } : {}) },
        data: { usedCount: { increment: 1 } },
      });
      if (claimed.count === 0) throw new OrderError("Cupom esgotado");
      couponId = coupon.id;
    }

    // ── Desconto do operador: sobre o pedido inteiro (itens + frete); não acumula com cupom ──
    let discountNote: string | undefined;
    if (input.manualDiscount) {
      if (couponId) throw new OrderError("Desconto manual não acumula com cupom");
      const base = Math.round((subtotal + deliveryFee) * 100) / 100;
      const { type, amount } = input.manualDiscount;
      if (!(amount > 0)) throw new OrderError("Desconto deve ser maior que zero");
      if (type === "PERCENT") {
        if (amount > 100) throw new OrderError("Desconto máximo: 100%");
        discount = Math.round(base * amount) / 100;
      } else {
        if (amount > base) throw new OrderError("Desconto maior que o valor do pedido");
        discount = Math.round(amount * 100) / 100;
      }
      discountNote = input.manualDiscount.note?.trim().slice(0, 200) || (type === "PERCENT" ? `${amount}%` : undefined);
    }

    const total = Math.max(0, Math.round((subtotal - discount + deliveryFee) * 100) / 100);
    const payNow = input.paymentMethod !== "INVOICE" && !!input.markPaid;
    // Total zero (100% de desconto) não tem o que cobrar: o pagamento já nasce quitado e o faturado não gera conta a receber
    const paidAlready = payNow || total === 0;

    // ── Número sequencial por unidade ─────────────────────────────────────
    // Lock consultivo (liberado no fim da transação): pedidos da mesma unidade passam a alocar o
    // número em série. Só o retry não bastava — sob rajada os perdedores voltavam a disputar o mesmo número.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"order-number:" + unit.id}))`;
    const last = await tx.order.findFirst({ where: { unitId: unit.id }, orderBy: { number: "desc" }, select: { number: true } });
    const number = (last?.number ?? 0) + 1;

    const created = await tx.order.create({
      data: {
        number,
        brandId: unit.brandId,
        unitId: unit.id,
        customerId: customer.id,
        addressId: input.addressId,
        deliveryZoneId: zone?.id,
        type: input.type ?? "DELIVERY",
        status: input.initialStatus ?? "PENDING",
        ...(input.initialStatus && input.initialStatus !== "PENDING" ? { confirmedAt: new Date() } : {}),
        priceTier: tier,
        courierId,
        courierFee,
        courierAssignedAt: courierId ? new Date() : undefined,
        invoiceDays,
        createdBy: input.createdBy,
        discountNote,
        notes: input.notes,
        couponId,
        couponCode: couponId ? input.couponCode!.toUpperCase().trim() : undefined,
        scheduledTo: input.scheduledTo ?? null,
        subtotal,
        deliveryFee,
        discount,
        total,
        items: {
          create: orderItems.map(({ components, ...item }) => ({
            ...item,
            ...(components?.length ? { components: { create: components } } : {}),
          })),
        },
        payment: {
          create: {
            method: input.paymentMethod,
            amount: total,
            status: paidAlready ? "PAID" : PAY_ON_DELIVERY.includes(input.paymentMethod) || input.paymentMethod === "INVOICE" ? "PENDING" : "PROCESSING",
            paidAt: paidAlready ? new Date() : undefined,
            changeAmount: input.changeAmount,
          },
        },
      },
      include: { items: { include: { components: true } }, payment: true, customer: true, address: true },
    });

    // ── Estoque: baixa atômica, sem deixar ficar negativo ─────────────────
    // Soma TUDO que o pedido consome por produto (itens simples + componentes dos combos): o mesmo produto
    // pode aparecer sozinho e dentro de um ou mais combos, e a checagem é pelo total.
    const need = new Map<string, { qty: number; name: string; stockId: string | null }>();
    const addNeed = (productId: string, name: string, qty: number, stockId: string | null) => {
      const cur = need.get(productId);
      need.set(productId, { qty: (cur?.qty ?? 0) + qty, name, stockId });
    };
    for (const item of orderItems) {
      if (item.components) {
        for (const comp of item.components) {
          const cp = productMap.get(item.productId).comboItems.find((ci: any) => ci.productId === comp.productId).product;
          addNeed(cp.id, cp.name, comp.quantity, cp.stockItem?.id ?? null);
        }
      } else {
        addNeed(item.productId, item.name, item.quantity, productMap.get(item.productId)?.stockItem?.id ?? null);
      }
    }
    for (const [, n] of need) {
      if (!n.stockId) continue; // produto sem controle de estoque
      const r = await tx.stockItem.updateMany({
        where: { id: n.stockId, quantity: { gte: n.qty } },
        data: { quantity: { decrement: n.qty } },
      });
      if (r.count === 0) throw new OrderError(`Estoque insuficiente: ${n.name}`, 409);
      await tx.stockMovement.create({
        data: { stockItemId: n.stockId, type: "OUT", quantity: n.qty, reason: SOURCE_LABEL[input.source], reference: created.id },
      });
    }

    // ── Cliente e fidelidade (pedidos de revenda não pontuam) ─────────────
    await tx.customer.update({ where: { id: customer.id }, data: { lastOrderAt: new Date() } });
    if (tier === "RETAIL") {
      const points = Math.floor(total);
      const card = await tx.loyaltyCard.upsert({
        where: { customerId: customer.id },
        create: { customerId: customer.id, points },
        update: { points: { increment: points } },
      });
      await tx.loyaltyTransaction.create({
        data: { loyaltyCardId: card.id, orderId: created.id, type: "EARN", points, description: `Pedido #${number}` },
      });
    }

    // ── Faturado: vira conta a receber (prazo contado da data do pedido) ──
    if (input.paymentMethod === "INVOICE" && total > 0) {
      await tx.financialEntry.create({
        data: {
          unitId: unit.id, type: "RECEIVABLE", description: `Pedido #${number} — ${customer.name}`, amount: total,
          dueDate: addDaysUTC(todayUTC(), invoiceDays!), customerId: customer.id, orderId: created.id,
          source: "ORDER", sourceKey: `order:${created.id}`, createdBy: input.createdBy,
        },
      });
    }

    return { ...created, _items: orderItems };
  }));

  // ── Pós-transação (melhor esforço) ──────────────────────────────────────
  let paymentLinkUrl: string | undefined;
  if (ONLINE.includes(input.paymentMethod)) {
    try {
      const { url } = await createPaymentLink({
        orderId: order.id,
        orderNumber: order.number,
        items: order._items.map((i: any) => ({ quantity: i.quantity, price: Math.round(i.price * 100), description: i.name })),
        customer: { name: order.customer.name, email: order.customer.email ?? undefined, phone: order.customer.phone },
      });
      paymentLinkUrl = url;
      await prisma.order.update({ where: { id: order.id }, data: { paymentLinkUrl: url } });
    } catch (e) {
      console.error("InfinityPay link generation failed:", e);
    }
  }

  emitAdminEvent({ unitId: unit.id, type: "order_new", orderId: order.id, orderNumber: order.number, customerName: order.customer.name });

  const { _items, ...result } = order;
  return { ...result, paymentLinkUrl };
}

/** Localiza ou cria o cliente pelo telefone dentro da unidade (checkout de visitante / WhatsApp). */
export async function findOrCreateCustomerByPhone(
  unit: { id: string; brandId: string },
  data: { phone: string; name?: string; email?: string | null },
) {
  const phone = data.phone.replace(/\D/g, "");
  if (phone.length < 10) throw new OrderError("Telefone inválido");

  const existing = await prisma.customer.findFirst({ where: { unitId: unit.id, phone } });
  if (existing) {
    // Conta de revendedor/franqueado não se usa como visitante: exige login (evita preço e conta de terceiros)
    if (existing.type !== "RETAIL") throw new OrderError("Este telefone está vinculado a uma conta. Entre para continuar.", 409);
    return existing;
  }

  return (prisma as any).$transaction(async (tx: any) => {
    const customer = await tx.customer.create({
      data: { brandId: unit.brandId, unitId: unit.id, name: data.name?.trim() || phone, phone, email: data.email || null },
    });
    await tx.loyaltyCard.create({ data: { customerId: customer.id } });
    return customer;
  });
}
