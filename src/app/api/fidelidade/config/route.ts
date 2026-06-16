import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getBrand() {
  return prisma.brand.findFirst({ where: { slug: "banguelas" } });
}

export async function GET() {
  const brand = await getBrand();
  if (!brand) return NextResponse.json({ error: "Marca não encontrada" }, { status: 404 });

  let config = await prisma.loyaltyConfig.findUnique({ where: { brandId: brand.id } });
  if (!config) {
    config = await prisma.loyaltyConfig.create({ data: { brandId: brand.id } });
  }
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  try {
    const brand = await getBrand();
    if (!brand) return NextResponse.json({ error: "Marca não encontrada" }, { status: 404 });

    const body = await req.json();
    const {
      programEnabled,
      targetOrders, minOrderValue, completionPeriodDays,
      rewardType, rewardValue, rewardValidDays,
      minIntervalHours, onlyDelivery, notCumulativeWithCoupons,
    } = body;

    const data = {
      ...(programEnabled !== undefined && { programEnabled }),
      ...(targetOrders !== undefined && { targetOrders }),
      ...(minOrderValue !== undefined && { minOrderValue }),
      ...(completionPeriodDays !== undefined && { completionPeriodDays }),
      ...(rewardType !== undefined && { rewardType }),
      ...(rewardValue !== undefined && { rewardValue }),
      ...(rewardValidDays !== undefined && { rewardValidDays }),
      ...(minIntervalHours !== undefined && { minIntervalHours }),
      ...(onlyDelivery !== undefined && { onlyDelivery }),
      ...(notCumulativeWithCoupons !== undefined && { notCumulativeWithCoupons }),
    };

    const config = await prisma.loyaltyConfig.upsert({
      where: { brandId: brand.id },
      update: data,
      create: { brandId: brand.id, ...data },
    });
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
  }
}
