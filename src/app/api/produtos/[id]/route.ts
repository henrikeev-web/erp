import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { parseInternalFields } from "@/lib/product-fields";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, unitId: auth.unit.id },
    include: { images: { orderBy: { order: "asc" } }, category: true, stockItem: true },
  });
  if (!product) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    // Campos de escopo/controle nunca vêm do cliente
    const { id: _id, unitId: _u, brandId: _b, createdAt: _c, updatedAt: _up, kind: _k, comboSize: _cs, comboItems: _ci, ...data } = await req.json();

    // Campos internos validados e normalizados (vazio vira null)
    const internal = parseInternalFields(data);
    if ("error" in internal) return NextResponse.json({ error: internal.error }, { status: 400 });
    Object.assign(data, internal.data);

    if (data.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: data.categoryId, unitId: auth.unit.id }, select: { id: true } });
      if (!cat) return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
    }

    // Combo não tem preço de revenda (o revendedor paga o preço do combo)
    const isCombo = await prisma.product.findFirst({ where: { id, unitId: auth.unit.id, kind: "COMBO" }, select: { id: true } });
    if (isCombo) data.resalePrice = null;

    const product = await prisma.product.update({
      where: { id, unitId: auth.unit.id },
      data,
      include: { images: true, category: true, stockItem: true },
    });
    return NextResponse.json(product);
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "SKU ou código de barras já cadastrado" }, { status: 409 });
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    await prisma.product.update({ where: { id, unitId: auth.unit.id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
}
