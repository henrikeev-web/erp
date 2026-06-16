import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const coupons = await prisma.coupon.findMany({
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(coupons);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const brand = await prisma.brand.findFirst({ where: { slug: "banguelas" } });
    if (!brand) return NextResponse.json({ error: "Brand não encontrada" }, { status: 404 });

    const coupon = await prisma.coupon.create({
      data: {
        brandId: brand.id,
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
