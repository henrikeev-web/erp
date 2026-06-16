import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { unlink } from "fs/promises";
import { join } from "path";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user.role === "ADMIN";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const slide = await (prisma.bannerSlide as any).update({ where: { id }, data: body });
  return NextResponse.json(slide);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const slide = await (prisma.bannerSlide as any).findUnique({ where: { id } });
  if (!slide) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await (prisma.bannerSlide as any).delete({ where: { id } });

  for (const url of [slide.desktopImageUrl, slide.mobileImageUrl]) {
    if (url?.startsWith("/uploads/")) {
      try { await unlink(join(process.cwd(), "public", url)); } catch {}
    }
  }

  return NextResponse.json({ ok: true });
}
