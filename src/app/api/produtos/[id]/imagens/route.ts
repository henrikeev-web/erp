import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const images = await prisma.productImage.findMany({
    where: { productId: id },
    orderBy: [{ isMain: "desc" }, { order: "asc" }],
  });
  return NextResponse.json(images);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { url, alt, isMain } = await req.json();

  if (isMain) {
    await prisma.productImage.updateMany({ where: { productId: id }, data: { isMain: false } });
  }

  const image = await prisma.productImage.create({
    data: { productId: id, url, alt: alt ?? null, isMain: isMain ?? false, order: 0 },
  });
  return NextResponse.json(image, { status: 201 });
}
