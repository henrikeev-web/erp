import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const brand = await prisma.brand.findFirst({ where: { slug: "banguelas" } });
  if (!brand) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(brand);
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, primaryColor, logoUrl, bannerTitle, bannerSubtitle, bannerBgColor, bannerBadges } = body;
    const brand = await prisma.brand.findFirst({ where: { slug: "banguelas" } });
    if (!brand) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    const updated = await prisma.brand.update({
      where: { id: brand.id },
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
