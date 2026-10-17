import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { parseCoupon } from "@/lib/sanitize";

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
    const parsed = parseCoupon(await req.json(), false);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const d = parsed.data;

    const coupon = await prisma.coupon.create({
      data: {
        brandId: unit.brandId,
        unitId: unit.id,
        ...d,
        minOrder: d.minOrder ?? 0,
        validFrom: d.validFrom ?? new Date(),
        firstOrderOnly: d.firstOrderOnly ?? false,
        active: true,
      } as any,
    });
    return NextResponse.json(coupon, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") return NextResponse.json({ error: "Código já existe" }, { status: 409 });
    return NextResponse.json({ error: "Erro ao criar cupom" }, { status: 500 });
  }
}
