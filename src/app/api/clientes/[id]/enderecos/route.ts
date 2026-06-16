import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: customerId } = await params;
  const body = await req.json();
  const { label, cep, street, number, complement, neighborhood, city, state, deliveryZoneId } = body;

  const address = await prisma.customerAddress.create({
    data: { customerId, label: label ?? "Entrega", cep, street, number, complement, neighborhood, city, state: state ?? "SP", deliveryZoneId },
  });

  return NextResponse.json(address, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: customerId } = await params;
  const addresses = await prisma.customerAddress.findMany({
    where: { customerId },
    include: { deliveryZone: true },
  });
  return NextResponse.json(addresses);
}
