import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const zones = await prisma.deliveryZone.findMany({
    where: { active: true },
    orderBy: { fee: "asc" },
  });
  return NextResponse.json(zones);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const zone = await prisma.deliveryZone.create({ data: body });
  return NextResponse.json(zone, { status: 201 });
}
