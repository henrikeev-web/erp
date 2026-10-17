import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleCatalogSync } from "@/lib/catalog-sync";
import { requireStaff } from "@/lib/api-auth";
import { unlink } from "fs/promises";
import { isImageUrl, uploadFilePath } from "@/lib/upload-url";

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

  // Só campos conhecidos: o corpo cru nunca vai para o Prisma
  const raw = await req.json();
  const data: { url?: string; alt?: string | null; isMain?: boolean; order?: number } = {};
  if (raw.url !== undefined) {
    if (!isImageUrl(raw.url)) return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
    data.url = raw.url;
  }
  if (raw.alt !== undefined) data.alt = typeof raw.alt === "string" ? raw.alt.slice(0, 200) : null;
  if (typeof raw.isMain === "boolean") data.isMain = raw.isMain;
  if (Number.isInteger(raw.order)) data.order = raw.order;

  if (data.isMain) {
    await prisma.productImage.updateMany({ where: { productId: id }, data: { isMain: false } });
  }

  const image = await prisma.productImage.update({ where: { id: imgId }, data });
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

  await prisma.productImage.delete({ where: { id: imgId } });

  // Só apaga o arquivo se for um upload nosso (caminho validado) e ninguém mais o usa:
  // as franquias compartilham as fotos da matriz.
  const file = uploadFilePath(image.url);
  if (file && (await prisma.productImage.count({ where: { url: image.url } })) === 0) {
    try { await unlink(file); } catch { /* arquivo pode não existir */ }
  }

  scheduleCatalogSync(auth.unit);
  return NextResponse.json({ ok: true });
}
