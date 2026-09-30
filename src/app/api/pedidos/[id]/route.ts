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
      customer: { omit: { passwordHash: true } },
      address: true,
      deliveryZone: true,
      items: { include: { product: { include: { images: true } }, components: true } },
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
    const { status, cancelReason, courierId } = await req.json();
    if (status !== undefined && !STATUSES.includes(status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    if (status === undefined && courierId === undefined) return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });

    const current = await prisma.order.findFirst({
      where: { id, unitId: auth.unit.id },
      select: { status: true, type: true, courierId: true, courierFee: true, deliveryZone: { select: { courierFee: true } } },
    });
    if (!current) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    // ── Entregador ─────────────────────────────────────────────────────────
    // Pedido de ENTREGA não avança para produção/pronto/enviado/entregue sem entregador (retirada não precisa).
    // O custo do entregador (por região) é gravado no pedido ao escolher e não muda se a zona for reajustada depois.
    const isDelivery = current.type === "DELIVERY";
    let courierData: Record<string, unknown> = {};
    if (courierId !== undefined) {
      if (!isDelivery) return NextResponse.json({ error: "Entregador só se aplica a pedidos de entrega" }, { status: 400 });
      if (["DELIVERED", "CANCELLED"].includes(current.status) || status === "CANCELLED") {
        return NextResponse.json({ error: "Pedido finalizado: não é possível trocar o entregador" }, { status: 409 });
      }
      const courier = await prisma.courier.findFirst({ where: { id: courierId, unitId: auth.unit.id, active: true }, select: { id: true } });
      if (!courier) return NextResponse.json({ error: "Entregador inválido" }, { status: 400 });
      courierData = {
        courierId: courier.id,
        courierFee: current.courierFee ?? current.deliveryZone?.courierFee ?? 0, // mantém o valor gravado na 1ª escolha
        courierAssignedAt: new Date(),
      };
    }
    const targetStatus: string = status ?? current.status;
    if (isDelivery && ["IN_PRODUCTION", "READY", "DISPATCHED", "DELIVERED"].includes(targetStatus) && !(courierData.courierId ?? current.courierId)) {
      return NextResponse.json({ error: "Selecione o entregador para este pedido de entrega", code: "COURIER_REQUIRED" }, { status: 409 });
    }

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
        ...(status !== undefined && { status }),
        ...(status !== undefined && timestampMap[status]),
        ...courierData,
      },
      include: {
        courier: { select: { id: true, name: true } },
        customer: { select: { name: true, phone: true } },
        items: true,
        payment: true,
      },
    });

    // Só troca de entregador (sem mudar status): nada mais a fazer
    if (status === undefined) return NextResponse.json(order);

    // Faturado NÃO vira pago ao entregar: quem baixa é a conta a receber (financeiro)
    if (status === "DELIVERED" && order.payment && order.payment.method !== "INVOICE") {
      await prisma.payment.update({
        where: { orderId: id },
        data: { status: "PAID", paidAt: new Date() },
      });
    }

    // Pedido cancelado: a conta a receber em aberto do faturamento também é cancelada
    if (status === "CANCELLED") {
      await prisma.financialEntry.updateMany({ where: { orderId: id, unitId: auth.unit.id, status: "OPEN" }, data: { status: "CANCELLED" } });
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
