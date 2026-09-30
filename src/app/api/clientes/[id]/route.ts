import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, unitId: auth.unit.id },
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
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const body = await req.json();
    const { name, email, cpf, notes, active } = body;
    const customer = await prisma.customer.update({
      where: { id, unitId: auth.unit.id },
      data: { name, email, cpf, notes, active },
      include: { children: true, loyaltyCard: true },
    });
    return NextResponse.json(customer);
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}
