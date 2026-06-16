import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentLink } from "@/lib/infinitepay";
import { emitAdminEvent } from "@/lib/sse";
import { z } from "zod";

function authOk(req: NextRequest) {
  const key = process.env.WHATSAPP_API_KEY;
  if (!key) return true;
  return req.headers.get("authorization") === `Bearer ${key}`;
}

const schema = z.object({
  phone: z.string(),
  brandSlug: z.string().default("banguelas"),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })),
  deliveryZoneId: z.string().optional(),
  addressId: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(["PIX", "CASH", "ONLINE_PIX", "CREDIT_CARD"]).default("ONLINE_PIX"),
});

// n8n calls this to create an order from a WhatsApp conversation
export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data = schema.parse(body);

  const brand = await prisma.brand.findFirst({ where: { slug: data.brandSlug } });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  let customer = await prisma.customer.findUnique({ where: { phone: data.phone } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { brandId: brand.id, name: data.phone, phone: data.phone },
    });
    await prisma.loyaltyCard.create({ data: { customerId: customer.id } });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: data.items.map((i) => i.productId) } },
    include: { stockItem: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const orderItems = data.items.map((item) => {
    const p = productMap.get(item.productId);
    if (!p) throw new Error(`Produto ${item.productId} não encontrado`);
    const total = p.price * item.quantity;
    subtotal += total;
    return { productId: p.id, name: p.name, price: p.price, quantity: item.quantity, total };
  });

  let deliveryFee = 0;
  if (data.deliveryZoneId) {
    const zone = await prisma.deliveryZone.findUnique({ where: { id: data.deliveryZoneId } });
    if (zone) deliveryFee = zone.freeAbove && subtotal >= zone.freeAbove ? 0 : zone.fee;
  }

  const total = subtotal + deliveryFee;
  const lastOrder = await prisma.order.findFirst({
    where: { brandId: brand.id },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (lastOrder?.number ?? 0) + 1;

  const order = await prisma.$transaction(async (tx: any) => {
    const created = await tx.order.create({
      data: {
        number,
        brandId: brand.id,
        customerId: customer!.id,
        addressId: data.addressId,
        deliveryZoneId: data.deliveryZoneId,
        type: "DELIVERY",
        notes: data.notes,
        subtotal,
        deliveryFee,
        discount: 0,
        total,
        items: { create: orderItems },
        payment: {
          create: {
            method: data.paymentMethod,
            amount: total,
            status: "PENDING",
          },
        },
      },
      include: { items: true, payment: true },
    });

    for (const item of data.items) {
      const p = productMap.get(item.productId);
      if (p?.stockItem) {
        await tx.stockItem.update({
          where: { productId: p.id },
          data: { quantity: { decrement: item.quantity } },
        });
        await tx.stockMovement.create({
          data: { stockItemId: p.stockItem.id, type: "OUT", quantity: item.quantity, reason: "WhatsApp", reference: created.id },
        });
      }
    }

    await tx.customer.update({ where: { id: customer!.id }, data: { lastOrderAt: new Date() } });
    return created;
  });

  // Generate payment link for online payments
  let paymentLinkUrl: string | undefined;
  if (["ONLINE_PIX", "ONLINE_CREDIT"].includes(data.paymentMethod)) {
    try {
      const { url } = await createPaymentLink({
        orderId: order.id,
        orderNumber: order.number,
        items: orderItems.map((i) => ({ quantity: i.quantity, price: Math.round(i.price * 100), description: i.name })),
        customer: { name: customer.name, phone: customer.phone },
      });
      paymentLinkUrl = url;
      await prisma.order.update({ where: { id: order.id }, data: { paymentLinkUrl: url } });
    } catch (e) {
      console.error("InfinityPay link generation failed:", e);
    }
  }

  emitAdminEvent({ type: "order_new", orderId: order.id, orderNumber: order.number, customerName: customer.name });

  return NextResponse.json({ orderId: order.id, orderNumber: order.number, total, paymentLinkUrl }, { status: 201 });
}
