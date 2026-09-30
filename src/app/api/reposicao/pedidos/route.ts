/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireFranchiseAdmin } from "@/lib/api-auth";
import { getFranchiseCustomer, getHQ } from "@/lib/replenishment";
import { createOrder, OrderError } from "@/lib/order-service";
import { RESELLER_INVOICE_DAYS } from "@/lib/invoice-terms";

export const dynamic = "force-dynamic";

const schema = z.object({
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(10_000) })).min(1, "Adicione ao menos um produto"),
  paymentMethod: z.enum(["INVOICE", "PIX"]),
  invoiceDays: z.number().int().optional(),
  notes: z.string().trim().max(500).optional(),
});

// Histórico de reposições desta franquia (pedidos na matriz em nome do franqueado)
export async function GET() {
  const auth = await requireFranchiseAdmin();
  if (auth instanceof NextResponse) return auth;
  const hq = await getHQ(auth.unit.brandId);
  const customer = await getFranchiseCustomer(auth.unit.id);
  if (!hq || !customer) return NextResponse.json([]);

  const orders: any[] = await prisma.order.findMany({
    where: { unitId: hq.id, customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, number: true, status: true, subtotal: true, total: true, notes: true, createdAt: true, deliveredAt: true, restockedAt: true,
      payment: { select: { method: true, status: true } }, invoiceDays: true,
      items: { select: { productId: true, name: true, quantity: true, price: true, total: true } },
    },
  });
  return NextResponse.json(orders);
}

// Novo pedido de reposição à matriz
export async function POST(req: NextRequest) {
  const auth = await requireFranchiseAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const d = schema.parse(await req.json());
    const hq = await getHQ(auth.unit.brandId);
    const customer = await getFranchiseCustomer(auth.unit.id);
    if (!hq) return NextResponse.json({ error: "Matriz não encontrada" }, { status: 404 });
    if (!customer) return NextResponse.json({ error: "Esta franquia não tem cadastro de franqueado na matriz. Fale com a matriz." }, { status: 409 });

    if (d.paymentMethod === "INVOICE" && !(RESELLER_INVOICE_DAYS as readonly number[]).includes(d.invoiceDays ?? -1)) {
      return NextResponse.json({ error: `Prazo inválido. Opções: ${RESELLER_INVOICE_DAYS.join(", ")} dias` }, { status: 400 });
    }

    const order = await createOrder({
      unit: hq, customerId: customer.id, type: "PICKUP", paymentMethod: d.paymentMethod,
      invoiceDays: d.paymentMethod === "INVOICE" ? d.invoiceDays : undefined,
      items: d.items, source: "ADMIN", pricing: "FRANCHISE", createdBy: auth.userId,
      notes: `Reposição — ${auth.unit.name}${d.notes ? ` — ${d.notes}` : ""}`,
    });
    return NextResponse.json({ id: order.id, number: order.number, total: order.total, status: order.status }, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[reposicao]", e);
    return NextResponse.json({ error: "Erro ao criar o pedido de reposição" }, { status: 500 });
  }
}
