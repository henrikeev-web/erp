import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; imgId: string }> }) {
  const { id, imgId } = await params;
  const body = await req.json();

  if (body.isMain) {
    await prisma.productImage.updateMany({ where: { productId: id }, data: { isMain: false } });
  }

  const image = await prisma.productImage.update({ where: { id: imgId }, data: body });
  return NextResponse.json(image);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; imgId: string }> }) {
  const { imgId } = await params;

  const image = await prisma.productImage.findUnique({ where: { id: imgId } });
  if (!image) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (image.url.startsWith("/uploads/")) {
    try {
      await unlink(join(process.cwd(), "public", image.url));
    } catch {
      // arquivo pode não existir, ignorar
    }
  }

  await prisma.productImage.delete({ where: { id: imgId } });
  return NextResponse.json({ ok: true });
}
