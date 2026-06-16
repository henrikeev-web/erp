export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitAdminEvent } from "@/lib/sse";

// InfinityPay calls this when payment is confirmed
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      order_nsu: orderId,
      transaction_nsu: transactionNsu,
      invoice_slug: slug,
      paid_amount: paidAmount,
      capture_method: captureMethod,
      receipt_url: receiptUrl,
    } = body;

    if (!orderId) return NextResponse.json({ error: "order_nsu missing" }, { status: 400 });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, customer: { select: { name: true } } },
    });

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Idempotency: skip if already paid
    if (order.payment?.status === "PAID") return NextResponse.json({ ok: true });

    await prisma.$transaction(async (tx: any) => {
      await tx.payment.update({
        where: { orderId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          gatewayId: transactionNsu ?? slug,
          gatewayData: { slug, paidAmount, captureMethod, receiptUrl },
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
    });

    emitAdminEvent({
      type: "order_confirmed",
      orderId: order.id,
      orderNumber: order.number,
      customerName: order.customer.name,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("InfinityPay webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
