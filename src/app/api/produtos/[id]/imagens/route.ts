import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleCatalogSync } from "@/lib/catalog-sync";
import { requireStaff } from "@/lib/api-auth";

async function ownProduct(id: string, unitId: string) {
  return prisma.product.findFirst({ where: { id, unitId }, select: { id: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!(await ownProduct(id, auth.unit.id))) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const images = await prisma.productImage.findMany({
    where: { productId: id },
    orderBy: [{ isMain: "desc" }, { order: "asc" }],
  });
  return NextResponse.json(images);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!(await ownProduct(id, auth.unit.id))) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const { url, alt, isMain } = await req.json();

  if (isMain) {
    await prisma.productImage.updateMany({ where: { productId: id }, data: { isMain: false } });
  }

  const image = await prisma.productImage.create({
    data: { productId: id, url, alt: alt ?? null, isMain: isMain ?? false, order: 0 },
  });
  scheduleCatalogSync(auth.unit);
  return NextResponse.json(image, { status: 201 });
}
