import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitAdminEvent } from "@/lib/sse";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      address: true,
      deliveryZone: true,
      items: { include: { product: { include: { images: true } } } },
      payment: true,
      fiscalDocs: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { status, cancelReason } = await req.json();

    const timestampMap: Record<string, Record<string, Date | null>> = {
      CONFIRMED: { confirmedAt: new Date() },
      READY: { readyAt: new Date() },
      DISPATCHED: { dispatchedAt: new Date() },
      DELIVERED: { deliveredAt: new Date() },
      CANCELLED: { cancelledAt: new Date(), cancelReason: cancelReason ?? null },
    };

    const order = await prisma.order.update({
      where: { id },
      data: {
        status,
        ...timestampMap[status],
      },
      include: {
        customer: { select: { name: true, phone: true } },
        items: true,
        payment: true,
      },
    });

    if (status === "DELIVERED" && order.payment) {
      await prisma.payment.update({
        where: { orderId: id },
        data: { status: "PAID", paidAt: new Date() },
      });
    }

    // Emit SSE for auto-print on CONFIRMED
    if (status === "CONFIRMED") {
      emitAdminEvent({
        type: "order_confirmed",
        orderId: id,
        orderNumber: order.number,
        customerName: order.customer.name,
        status,
      });
    } else {
      emitAdminEvent({
        type: "order_status",
        orderId: id,
        orderNumber: order.number,
        customerName: order.customer.name,
        status,
      });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao atualizar pedido" }, { status: 500 });
  }
}
