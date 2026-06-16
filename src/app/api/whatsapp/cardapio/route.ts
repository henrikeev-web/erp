import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function authOk(req: NextRequest) {
  const key = process.env.WHATSAPP_API_KEY;
  if (!key) return true; // no key configured — open (dev mode)
  return req.headers.get("authorization") === `Bearer ${key}`;
}

// n8n calls this to get the product list for the chatbot
export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brand = await prisma.brand.findFirst({ where: { slug: "banguelas" } });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const products = await prisma.product.findMany({
    where: { brandId: brand.id, active: true },
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
