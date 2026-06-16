import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const brand = await (prisma.brand as any).findUnique({
    where: { slug: "banguelas" },
    include: { bannerSlides: { orderBy: { order: "asc" } } },
  });
  if (!brand) return NextResponse.json([]);
  return NextResponse.json(brand.bannerSlides);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brand = await (prisma.brand as any).findUnique({ where: { slug: "banguelas" } });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const body = await req.json();
  const slide = await (prisma.bannerSlide as any).create({
    data: {
      brandId: brand.id,
      desktopImageUrl: body.desktopImageUrl,
      mobileImageUrl: body.mobileImageUrl,
      linkUrl: body.linkUrl ?? null,
      order: body.order ?? 0,
      active: body.active ?? true,
    },
  });

  return NextResponse.json(slide, { status: 201 });
}
