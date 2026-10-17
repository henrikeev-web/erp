import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { parseStockMove } from "@/lib/sanitize";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const parsed = parseStockMove(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { type, quantity, reason } = parsed.data;

  // Leitura + gravação condicionadas ao saldo lido: se alguém movimentou no meio, recusa em vez de sobrescrever
  const result = await (prisma as any).$transaction(async (tx: any) => {
    const stockItem = await tx.stockItem.findFirst({ where: { id, product: { unitId: auth.unit.id } } });
    if (!stockItem) return { status: 404 as const };

    const newQty = type === "IN" ? stockItem.quantity + quantity : type === "OUT" ? Math.max(0, stockItem.quantity - quantity) : quantity;
    const done = await tx.stockItem.updateMany({ where: { id, quantity: stockItem.quantity }, data: { quantity: newQty } });
    if (done.count === 0) return { status: 409 as const };

    await tx.stockMovement.create({
      data: {
        stockItemId: id,
        type,
        quantity: type === "ADJUSTMENT" ? quantity - stockItem.quantity : type === "OUT" ? stockItem.quantity - newQty : quantity,
        reason: reason ?? (type === "IN" ? "Entrada manual" : type === "OUT" ? "Saída manual" : "Ajuste"),
      },
    });
    return { status: 200 as const, quantity: newQty };
  });

  if (result.status === 404) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  if (result.status === 409) return NextResponse.json({ error: "O estoque foi alterado por outra pessoa. Atualize a página e tente de novo." }, { status: 409 });
  return NextResponse.json({ quantity: result.quantity });
}
