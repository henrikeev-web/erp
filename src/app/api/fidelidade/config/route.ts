import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, resolveUnit } from "@/lib/api-auth";

// As regras de fidelidade são da rede (por marca): qualquer unidade lê, só a matriz edita.
export async function GET() {
  const unit = await resolveUnit();
  if (unit instanceof NextResponse) return unit;

  let config = await prisma.loyaltyConfig.findUnique({ where: { brandId: unit.brandId } });
  if (!config) {
    config = await prisma.loyaltyConfig.create({ data: { brandId: unit.brandId } });
  }
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  if (auth.unit.type !== "HQ") {
    return NextResponse.json({ error: "Apenas a matriz pode alterar as regras de fidelidade" }, { status: 403 });
  }
  const brand = { id: auth.unit.brandId };

  try {
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
