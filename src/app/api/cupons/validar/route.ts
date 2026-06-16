import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { code, brandId, subtotal } = await req.json();

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: code.toUpperCase(),
      brandId,
      active: true,
      OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
      AND: [{ validFrom: { lte: new Date() } }],
    },
  });

  if (!coupon) {
    return NextResponse.json({ error: "Cupom inválido ou expirado" }, { status: 404 });
  }

  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 });
  }

  if (subtotal < coupon.minOrder) {
    return NextResponse.json({
      error: `Pedido mínimo de R$ ${coupon.minOrder.toFixed(2)} para este cupom`,
    }, { status: 400 });
  }

  let discount = 0;
  if (coupon.type === "PERCENTAGE") discount = (subtotal * coupon.value) / 100;
  else if (coupon.type === "FIXED") discount = coupon.value;
  else if (coupon.type === "FREE_DELIVERY") discount = 0;

  if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;

  return NextResponse.json({ code: coupon.code, discount, type: coupon.type, freeDelivery: coupon.type === "FREE_DELIVERY" });
}
