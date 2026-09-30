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

    const coupon = await prisma.coupon.create({
      data: {
        brandId: unit.brandId,
        unitId: unit.id,
        code: body.code.toUpperCase().trim(),
        description: body.description || null,
        type: body.type,
        value: parseFloat(body.value),
        minOrder: parseFloat(body.minOrder ?? 0),
        maxDiscount: body.maxDiscount ? parseFloat(body.maxDiscount) : null,
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
