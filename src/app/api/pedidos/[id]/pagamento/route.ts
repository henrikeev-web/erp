import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentLink } from "@/lib/infinitepay";
import { requireStaff } from "@/lib/api-auth";

// Generate or resend an InfinityPay payment link for an order
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, unitId: auth.unit.id },
    include: {
      items: true,
      customer: { select: { name: true, email: true, phone: true } },
      payment: true,
    },
  });

  if (!order) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (order.payment?.status === "PAID")
    return NextResponse.json({ error: "Pedido já pago" }, { status: 409 });

  const infinityItems = order.items.map((item) => ({
    quantity: item.quantity,
    price: Math.round(item.price * 100), // cents
    description: item.name,
  }));

  const { url } = await createPaymentLink({
    orderId: order.id,
    orderNumber: order.number,
    items: infinityItems,
    customer: {
      name: order.customer.name,
      email: order.customer.email ?? undefined,
      phone: order.customer.phone,
    },
  });

  await prisma.order.update({ where: { id }, data: { paymentLinkUrl: url } });

  return NextResponse.json({ paymentLinkUrl: url });
}
