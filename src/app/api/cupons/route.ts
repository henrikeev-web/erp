import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const coupons = await prisma.coupon.findMany({
    where: { unitId: auth.unit.id },
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(coupons);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;

  try {
    const body = await req.json();
    if (!["PERCENTAGE", "FIXED", "FREE_DELIVERY"].includes(body.type)) return NextResponse.json({ error: "Tipo de cupom inválido" }, { status: 400 });
    if (!body.code?.trim()) return NextResponse.json({ error: "Informe o código do cupom" }, { status: 400 });
    const freeDelivery = body.type === "FREE_DELIVERY";
    const value = freeDelivery ? 0 : parseFloat(body.value);
    if (!Number.isFinite(value) || (!freeDelivery && value <= 0)) return NextResponse.json({ error: "Valor do cupom inválido" }, { status: 400 });

    const coupon = await prisma.coupon.create({
      data: {
        brandId: unit.brandId,
        unitId: unit.id,
        code: body.code.toUpperCase().trim(),
        description: body.description || null,
        type: body.type,
        value,
        minOrder: parseFloat(body.minOrder ?? 0),
        maxDiscount: !freeDelivery && body.maxDiscount ? parseFloat(body.maxDiscount) : null,
        maxUses: body.maxUses ? parseInt(body.maxUses) : null,
        validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
        validTo: body.validTo ? new Date(body.validTo) : null,
        ageMin: body.ageMin ? parseInt(body.ageMin) : null,
        ageMax: body.ageMax ? parseInt(body.ageMax) : null,
        firstOrderOnly: body.firstOrderOnly ?? false,
        active: true,
      },
    });
    return NextResponse.json(coupon, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") return NextResponse.json({ error: "Código já existe" }, { status: 409 });
    return NextResponse.json({ error: "Erro ao criar cupom" }, { status: 500 });
  }
}
