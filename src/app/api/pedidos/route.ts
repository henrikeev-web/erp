import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createPaymentLink } from "@/lib/infinitepay";
import { emitAdminEvent } from "@/lib/sse";

const createOrderSchema = z.object({
  brandId: z.string(),
  customerId: z.string(),
  addressId: z.string().optional(),
  deliveryZoneId: z.string().optional(),
  type: z.enum(["DELIVERY", "PICKUP", "DINE_IN"]).default("DELIVERY"),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  scheduledTo: z.string().datetime().optional(),
  paymentMethod: z.enum([
    "CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD",
    "VOUCHER", "ONLINE_CREDIT", "ONLINE_PIX", "ONLINE_BOLETO",
  ]),
  changeAmount: z.number().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    notes: z.string().optional(),
  })),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const brandId = searchParams.get("brandId");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const where: Record<string, unknown> = {
    ...(status && { status }),
    ...(brandId && { brandId }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        address: true,
        deliveryZone: { select: { name: true, fee: true } },
        items: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({ orders, total, page, limit });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createOrderSchema.parse(body);

    const products = await prisma.product.findMany({
      where: { id: { in: data.items.map((i) => i.productId) } },
      include: { stockItem: true },
    });

    type ProductWithStock = typeof products[0];
    const productMap = new Map<string, ProductWithStock>(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const orderItems = data.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Produto ${item.productId} não encontrado`);
      const total = product.price * item.quantity;
      subtotal += total;
      return { productId: item.productId, name: product.name, price: product.price, quantity: item.quantity, total, notes: item.notes };
    });

    let deliveryFee = 0;
    if (data.deliveryZoneId) {
      const zone = await prisma.deliveryZone.findUnique({ where: { id: data.deliveryZoneId } });
      if (zone) {
        deliveryFee = zone.freeAbove && subtotal >= zone.freeAbove ? 0 : zone.fee;
      }
    }

    let discount = 0;
    let couponId: string | undefined;
    if (data.couponCode) {
      const coupon = await prisma.coupon.findFirst({
        where: { code: data.couponCode, active: true },
      });
      if (coupon) {
        if (coupon.type === "PERCENTAGE") discount = (subtotal * coupon.value) / 100;
        else if (coupon.type === "FIXED") discount = coupon.value;
        else if (coupon.type === "FREE_DELIVERY") deliveryFee = 0;
        if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
        couponId = coupon.id;
        await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }
    }

    const total = Math.max(0, subtotal - discount + deliveryFee);

    const lastOrder = await prisma.order.findFirst({
      where: { brandId: data.brandId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const number = (lastOrder?.number ?? 0) + 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await prisma.$transaction(async (tx: any) => {
      const created = await tx.order.create({
        data: {
          number,
          brandId: data.brandId,
          customerId: data.customerId,
          addressId: data.addressId,
          deliveryZoneId: data.deliveryZoneId,
          type: data.type,
          notes: data.notes,
          couponId,
          couponCode: data.couponCode,
          scheduledTo: data.scheduledTo ? new Date(data.scheduledTo) : null,
          subtotal,
          deliveryFee,
          discount,
          total,
          items: { create: orderItems },
          payment: {
            create: {
              method: data.paymentMethod,
              amount: total,
              status: ["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "VOUCHER"].includes(data.paymentMethod)
                ? "PENDING"
                : "PROCESSING",
              changeAmount: data.changeAmount,
            },
          },
        },
        include: { items: true, payment: true, customer: true, address: true },
      });

      for (const item of data.items) {
        const product = productMap.get(item.productId);
        if (product?.stockItem) {
          await tx.stockItem.update({
            where: { productId: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              stockItemId: product.stockItem.id,
              type: "OUT",
              quantity: item.quantity,
              reason: "Pedido",
              reference: created.id,
            },
          });
        }
      }

      await tx.customer.update({
        where: { id: data.customerId },
        data: { lastOrderAt: new Date() },
      });

      const loyaltyCard = await tx.loyaltyCard.upsert({
        where: { customerId: data.customerId },
        create: { customerId: data.customerId, points: Math.floor(total) },
        update: { points: { increment: Math.floor(total) } },
      });

      await tx.loyaltyTransaction.create({
        data: {
          loyaltyCardId: loyaltyCard.id,
          orderId: created.id,
          type: "EARN",
          points: Math.floor(total),
          description: `Pedido #${number}`,
        },
      });

      return created;
    });

    // Generate InfinityPay link for online payment methods
    let paymentLinkUrl: string | undefined;
    if (["ONLINE_PIX", "ONLINE_CREDIT", "ONLINE_BOLETO"].includes(data.paymentMethod)) {
      try {
        const customer = await prisma.customer.findUnique({
          where: { id: data.customerId },
          select: { name: true, email: true, phone: true },
        });
        const infinityItems = orderItems.map((item) => ({
          quantity: item.quantity,
          price: Math.round(item.price * 100),
          description: item.name,
        }));
        const { url } = await createPaymentLink({
          orderId: order.id,
          orderNumber: order.number,
          items: infinityItems,
          customer: customer
            ? { name: customer.name, email: customer.email ?? undefined, phone: customer.phone }
            : undefined,
        });
        paymentLinkUrl = url;
        await prisma.order.update({ where: { id: order.id }, data: { paymentLinkUrl: url } });
      } catch (e) {
        console.error("InfinityPay link generation failed:", e);
      }
    }

    // Notify admin panel via SSE
    emitAdminEvent({
      type: "order_new",
      orderId: order.id,
      orderNumber: order.number,
      customerName: order.customer.name,
    });

    return NextResponse.json({ ...order, paymentLinkUrl }, { status: 201 });
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 422 });
    }
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }
}
