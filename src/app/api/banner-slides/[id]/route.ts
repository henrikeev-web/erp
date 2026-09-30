import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { unlink } from "fs/promises";
import { join } from "path";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { id: _id, unitId: _u, brandId: _b, ...data } = await req.json();
  try {
    const slide = await (prisma.bannerSlide as any).update({ where: { id, unitId: auth.unit.id }, data });
    return NextResponse.json(slide);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const slide = await (prisma.bannerSlide as any).findFirst({ where: { id, unitId: auth.unit.id } });
  if (!slide) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await (prisma.bannerSlide as any).delete({ where: { id } });

  for (const url of [slide.desktopImageUrl, slide.mobileImageUrl]) {
    if (url?.startsWith("/uploads/")) {
      try { await unlink(join(process.cwd(), "public", url)); } catch {}
    }
  }

  return NextResponse.json({ ok: true });
}
