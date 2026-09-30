import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUnitBySlugParam, whatsappAuthOk } from "@/lib/api-auth";

// n8n calls this to get the product list for the chatbot (?unit=slug, padrão matriz)
export async function GET(req: NextRequest) {
  if (!whatsappAuthOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unit = await resolveUnitBySlugParam(req.nextUrl.searchParams.get("unit"));
  if (unit instanceof NextResponse) return unit;

  const products = await prisma.product.findMany({
    where: { unitId: unit.id, active: true, kind: "SIMPLE" }, // combo exige montar a escolha: fora do bot,
    include: {
      images: { where: { isMain: true }, take: 1 },
      stockItem: { select: { quantity: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ featured: "desc" }, { order: "asc" }],
  });

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    description: p.description,
    category: p.category?.name ?? null,
    stock: p.stockItem?.quantity ?? 0,
    available: (p.stockItem?.quantity ?? 1) > 0,
    imageUrl: p.images[0]?.url ?? null,
  }));

  return NextResponse.json(result);
}
