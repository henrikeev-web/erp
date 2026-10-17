import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUnit } from "@/lib/api-auth";
import { clientIp, hit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const rl = hit(`coupon:${clientIp(req.headers)}`, 30, 10 * 60_000); // evita adivinhar códigos de cupom
  if (!rl.ok) return tooManyRequests(rl);
  const unit = await resolveUnit();
  if (unit instanceof NextResponse) return unit;
  const body = await req.json().catch(() => null);
  const code = body?.code;
  const subtotal = Number(body?.subtotal);
  if (typeof code !== "string" || !code.trim() || code.length > 40 || !Number.isFinite(subtotal)) {
    return NextResponse.json({ error: "Cupom inválido" }, { status: 400 });
  }

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: code.trim().toUpperCase(),
      unitId: unit.id,
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
