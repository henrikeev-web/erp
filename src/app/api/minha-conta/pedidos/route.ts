import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const orders = await (prisma.order as any).findMany({
    where: { customerId: customer!.id },
    // Campos internos do pedido (entregador/custo, quem criou, motivo do desconto) nunca vão para o cliente
    omit: { courierId: true, courierFee: true, courierAssignedAt: true, createdBy: true, discountNote: true },
    include: {
      items: { include: { product: { select: { images: { where: { isMain: true }, take: 1 } } } } },
      payment: { select: { method: true, status: true } },
      address: { select: { label: true, street: true, number: true, neighborhood: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(orders);
}
