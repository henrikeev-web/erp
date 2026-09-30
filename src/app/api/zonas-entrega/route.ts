import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, resolveUnit } from "@/lib/api-auth";
import { parseCourierFee } from "@/lib/courier-fee";

const ADMIN = ["SUPER_ADMIN", "ADMIN"];

// Público: o checkout lista as zonas da unidade — SEM o custo do entregador (dado interno).
// ?todas=true (painel, staff): inclui o custo do entregador só para administradores.
export async function GET(req: NextRequest) {
  if (new URL(req.url).searchParams.get("todas") === "true") {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    const zones = await prisma.deliveryZone.findMany({
      where: { unitId: auth.unit.id, active: true },
      orderBy: { fee: "asc" },
      omit: ADMIN.includes(auth.role) ? undefined : { courierFee: true },
    });
    return NextResponse.json(zones);
  }

  const unit = await resolveUnit();
  if (unit instanceof NextResponse) return unit;
  const zones = await prisma.deliveryZone.findMany({
    where: { unitId: unit.id, active: true },
    orderBy: { fee: "asc" },
    omit: { courierFee: true },
  });
  return NextResponse.json(zones);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  // Nunca repassar o body cru ao Prisma: o cliente não pode escolher unitId nem id
  const { id: _id, unitId: _unitId, courierFee: rawFee, ...data } = await req.json();
  const fee = parseCourierFee(rawFee, auth.role);
  if ("error" in fee) return NextResponse.json({ error: fee.error }, { status: fee.status });

  const zone = await prisma.deliveryZone.create({ data: { ...data, ...fee.data, unitId: auth.unit.id } });
  return NextResponse.json(zone, { status: 201 });
}
