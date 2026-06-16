import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      children: true,
      addresses: { include: { deliveryZone: true } },
      loyaltyCard: { include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } } },
      orders: {
        include: { items: true, payment: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: { select: { orders: true } },
    },
  });
  if (!customer) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(customer);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { name, email, cpf, notes, active } = body;
    const customer = await prisma.customer.update({
      where: { id },
      data: { name, email, cpf, notes, active },
      include: { children: true, loyaltyCard: true },
    });
    return NextResponse.json(customer);
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}
