import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleCatalogSync } from "@/lib/catalog-sync";
import { requireStaff, resolveUnit } from "@/lib/api-auth";

// Público (cardápio); includeInactive é só para o painel
export async function GET(req: NextRequest) {
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";

  let unitId: string;
  if (includeInactive) {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    unitId = auth.unit.id;
  } else {
    const unit = await resolveUnit();
    if (unit instanceof NextResponse) return unit;
    unitId = unit.id;
  }

  const categories = await prisma.category.findMany({
    where: includeInactive ? { unitId } : { unitId, active: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { name, slug, imageUrl, ageMin, ageMax, order } = body;
  try {
    const category = await prisma.category.create({
      data: { unitId: auth.unit.id, name, slug, imageUrl, ageMin, ageMax, order: order ?? 0 },
    });
    scheduleCatalogSync(auth.unit);
    return NextResponse.json(category, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") return NextResponse.json({ error: "Slug já existe" }, { status: 409 });
    throw err;
  }
}
