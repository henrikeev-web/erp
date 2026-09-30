import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleCatalogSync } from "@/lib/catalog-sync";
import { requireStaff } from "@/lib/api-auth";
import { unlink } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; imgId: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id, imgId } = await params;

  const existing = await prisma.productImage.findFirst({
    where: { id: imgId, productId: id, product: { unitId: auth.unit.id } },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const { id: _id, productId: _p, ...body } = await req.json();

  if (body.isMain) {
    await prisma.productImage.updateMany({ where: { productId: id }, data: { isMain: false } });
  }

  const image = await prisma.productImage.update({ where: { id: imgId }, data: body });
  scheduleCatalogSync(auth.unit);
  return NextResponse.json(image);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; imgId: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id, imgId } = await params;

  const image = await prisma.productImage.findFirst({
    where: { id: imgId, productId: id, product: { unitId: auth.unit.id } },
  });
  if (!image) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (image.url.startsWith("/uploads/")) {
    try {
      await unlink(join(process.cwd(), "public", image.url));
    } catch {
      // arquivo pode não existir, ignorar
    }
  }

  await prisma.productImage.delete({ where: { id: imgId } });
  scheduleCatalogSync(auth.unit);
  return NextResponse.json({ ok: true });
}
