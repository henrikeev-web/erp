import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, resolveUnit } from "@/lib/api-auth";

// A marca é da rede inteira: qualquer unidade lê, só a matriz edita.
export async function GET() {
  const unit = await resolveUnit();
  if (unit instanceof NextResponse) return unit;
  const brand = await prisma.brand.findUnique({ where: { id: unit.brandId } });
  if (!brand) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(brand);
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  if (auth.unit.type !== "HQ") {
    return NextResponse.json({ error: "Apenas a matriz pode alterar a marca" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, primaryColor, logoUrl, bannerTitle, bannerSubtitle, bannerBgColor, bannerBadges } = body;
    const updated = await prisma.brand.update({
      where: { id: auth.unit.brandId },
      data: {
        ...(name !== undefined && { name }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(bannerTitle !== undefined && { bannerTitle }),
        ...(bannerSubtitle !== undefined && { bannerSubtitle }),
        ...(bannerBgColor !== undefined && { bannerBgColor }),
        ...(bannerBadges !== undefined && { bannerBadges }),
      },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
  }
}
