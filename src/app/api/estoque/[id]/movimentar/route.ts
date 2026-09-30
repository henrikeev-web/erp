import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { type, quantity, reason } = await req.json();

  const stockItem = await prisma.stockItem.findFirst({ where: { id, product: { unitId: auth.unit.id } } });
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
