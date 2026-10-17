import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, resolveUnit } from "@/lib/api-auth";
import { isImageUrl, isSafeLink } from "@/lib/upload-url";

// Público: o cardápio da unidade mostra os slides dela
export async function GET() {
  const unit = await resolveUnit();
  if (unit instanceof NextResponse) return unit;

  const slides = await (prisma.bannerSlide as any).findMany({
    where: { unitId: unit.id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(slides);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;

  const body = await req.json();
  if (!isImageUrl(body.desktopImageUrl) || !isImageUrl(body.mobileImageUrl)) return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
  if (body.linkUrl && !isSafeLink(body.linkUrl)) return NextResponse.json({ error: "Link inválido: use um endereço https ou um caminho do site" }, { status: 400 });
  const slide = await (prisma.bannerSlide as any).create({
    data: {
      brandId: unit.brandId,
      unitId: unit.id,
      desktopImageUrl: body.desktopImageUrl,
      mobileImageUrl: body.mobileImageUrl,
      linkUrl: body.linkUrl ?? null,
      order: Number.isInteger(body.order) ? body.order : 0,
      active: body.active !== false,
    },
  });

  return NextResponse.json(slide, { status: 201 });
}
