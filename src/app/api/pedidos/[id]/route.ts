import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitAdminEvent } from "@/lib/sse";
import { requireStaff, requireStaffOrAgent } from "@/lib/api-auth";

const STATUSES = ["PENDING", "CONFIRMED", "IN_PRODUCTION", "READY", "DISPATCHED", "DELIVERED", "CANCELLED"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffOrAgent();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, unitId: auth.unit.id },
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
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { status, cancelReason } = await req.json();
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

    const timestampMap: Record<string, Record<string, Date | null>> = {
      CONFIRMED: { confirmedAt: new Date() },
      READY: { readyAt: new Date() },
      DISPATCHED: { dispatchedAt: new Date() },
      DELIVERED: { deliveredAt: new Date() },
      CANCELLED: { cancelledAt: new Date(), cancelReason: cancelReason ?? null },
    };

    const order = await prisma.order.update({
      where: { id, unitId: auth.unit.id },
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
        unitId: auth.unit.id,
        type: "order_confirmed",
        orderId: id,
        orderNumber: order.number,
        customerName: order.customer.name,
        status,
      });
    } else {
      emitAdminEvent({
        unitId: auth.unit.id,
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
