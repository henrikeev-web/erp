import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { unlink } from "fs/promises";
import { isImageUrl, isSafeLink, uploadFilePath } from "@/lib/upload-url";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  // Só campos conhecidos e validados (nada de id/unitId/brandId vindo do corpo)
  const raw = await req.json();
  const data: Record<string, unknown> = {};
  for (const f of ["desktopImageUrl", "mobileImageUrl"] as const) {
    if (raw[f] === undefined) continue;
    if (!isImageUrl(raw[f])) return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
    data[f] = raw[f];
  }
  if (raw.linkUrl !== undefined) {
    if (raw.linkUrl && !isSafeLink(raw.linkUrl)) return NextResponse.json({ error: "Link inválido: use um endereço https ou um caminho do site" }, { status: 400 });
    data.linkUrl = raw.linkUrl || null;
  }
  if (Number.isInteger(raw.order)) data.order = raw.order;
  if (typeof raw.active === "boolean") data.active = raw.active;
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
    const file = uploadFilePath(url);
    if (file) { try { await unlink(file); } catch { /* arquivo pode não existir */ } }
  }

  return NextResponse.json({ ok: true });
}
