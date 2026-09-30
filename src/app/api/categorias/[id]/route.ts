import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleCatalogSync } from "@/lib/catalog-sync";
import { requireStaff } from "@/lib/api-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const category = await prisma.category.findFirst({
    where: { id, unitId: auth.unit.id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  return NextResponse.json(category);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const body = await req.json();
    const { name, slug, imageUrl, ageMin, ageMax, order, active } = body;
    const category = await prisma.category.update({
      where: { id, unitId: auth.unit.id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(ageMin !== undefined && { ageMin }),
        ...(ageMax !== undefined && { ageMax }),
        ...(order !== undefined && { order }),
        ...(active !== undefined && { active }),
      },
    });
    scheduleCatalogSync(auth.unit);
    return NextResponse.json(category);
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    await prisma.category.update({ where: { id, unitId: auth.unit.id }, data: { active: false } });
    scheduleCatalogSync(auth.unit);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro ao remover" }, { status: 500 });
  }
}
