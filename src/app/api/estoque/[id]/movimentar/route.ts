import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { type, quantity, reason } = await req.json();

  const stockItem = await prisma.stockItem.findUnique({ where: { id } });
  if (!stockItem) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  let newQty = stockItem.quantity;
  if (type === "IN") newQty += quantity;
  else if (type === "OUT") newQty = Math.max(0, newQty - quantity);
  else if (type === "ADJUSTMENT") newQty = quantity;

  await prisma.$transaction([
    prisma.stockItem.update({ where: { id }, data: { quantity: newQty } }),
    prisma.stockMovement.create({
      data: {
        stockItemId: id,
        type,
        quantity: type === "ADJUSTMENT" ? quantity - stockItem.quantity : quantity,
        reason: reason ?? (type === "IN" ? "Entrada manual" : type === "OUT" ? "Saída manual" : "Ajuste"),
      },
    }),
  ]);

  return NextResponse.json({ quantity: newQty });
}
