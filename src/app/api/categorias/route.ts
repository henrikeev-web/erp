import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
  const categories = await prisma.category.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, slug, imageUrl, ageMin, ageMax, order } = body;
  const category = await prisma.category.create({
    data: { name, slug, imageUrl, ageMin, ageMax, order: order ?? 0 },
  });
  return NextResponse.json(category, { status: 201 });
}
