import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id: customerId } = await params;

  const customer = await prisma.customer.findFirst({ where: { id: customerId, unitId: auth.unit.id }, select: { id: true } });
  if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const body = await req.json();
  const { label, cep, street, number, complement, neighborhood, city, state, deliveryZoneId } = body;

  // A zona informada precisa ser da mesma unidade do cliente
  if (deliveryZoneId) {
    const zone = await prisma.deliveryZone.findFirst({ where: { id: deliveryZoneId, unitId: auth.unit.id }, select: { id: true } });
    if (!zone) return NextResponse.json({ error: "Zona inválida" }, { status: 400 });
  }

  const address = await prisma.customerAddress.create({
    data: { customerId, label: label ?? "Entrega", cep, street, number, complement, neighborhood, city, state: state ?? "SP", deliveryZoneId },
  });

  return NextResponse.json(address, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id: customerId } = await params;
  const addresses = await prisma.customerAddress.findMany({
    where: { customerId, customer: { unitId: auth.unit.id } },
    include: { deliveryZone: true },
  });
  return NextResponse.json(addresses);
}
