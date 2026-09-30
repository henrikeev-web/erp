import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, resolveUnit } from "@/lib/api-auth";

// Público: o checkout lista as zonas da unidade
export async function GET() {
  const unit = await resolveUnit();
  if (unit instanceof NextResponse) return unit;

  const zones = await prisma.deliveryZone.findMany({
    where: { unitId: unit.id, active: true },
    orderBy: { fee: "asc" },
  });
  return NextResponse.json(zones);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  // Nunca repassar o body cru ao Prisma: o cliente não pode escolher unitId nem id
  const { id: _id, unitId: _unitId, ...data } = await req.json();
  const zone = await prisma.deliveryZone.create({ data: { ...data, unitId: auth.unit.id } });
  return NextResponse.json(zone, { status: 201 });
}
