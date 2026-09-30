/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { checkOwnership, entrySchema, parseDateOnly, todayUTC } from "@/lib/financeiro";

const ROLES = ["SUPER_ADMIN", "ADMIN"];

const editSchema = entrySchema.pick({ description: true, amount: true, dueDate: true, supplierId: true, customerId: true, costCenterId: true, notes: true }).partial();
const paySchema = z.object({
  paidAt: z.string().optional(),
  paidAmount: z.coerce.number().positive("Valor pago deve ser maior que zero").optional(),
  payMethod: z.string().trim().max(40).optional(),
});

// action: "pay" | "reopen" | "cancel"; sem action = edição. Lançamento pago fica travado (reabra para editar).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;
  const { id } = await params;

  const entry = await prisma.financialEntry.findFirst({ where: { id, unitId: unit.id } });
  if (!entry) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

  try {
    const body = await req.json();
    const action = body.action as string | undefined;

    if (action === "pay") {
      if (entry.status !== "OPEN") return NextResponse.json({ error: "Só lançamentos em aberto podem ser baixados" }, { status: 409 });
      const p = paySchema.parse(body);
      const paidAt = p.paidAt ? parseDateOnly(p.paidAt) : todayUTC();
      // Conta a receber de pedido faturado: o pagamento do pedido acompanha a baixa
      if (entry.orderId) await prisma.payment.updateMany({ where: { orderId: entry.orderId, order: { unitId: unit.id } }, data: { status: "PAID", paidAt } });
      const updated = await prisma.financialEntry.update({
        where: { id, unitId: unit.id },
        data: { status: "PAID", paidAt, paidAmount: Math.round((p.paidAmount ?? entry.amount) * 100) / 100, payMethod: p.payMethod ?? null },
      });
      return NextResponse.json(updated);
    }
    if (action === "reopen") {
      if (entry.status === "OPEN") return NextResponse.json({ error: "Lançamento já está em aberto" }, { status: 409 });
      if (entry.orderId && entry.status === "PAID") await prisma.payment.updateMany({ where: { orderId: entry.orderId, order: { unitId: unit.id } }, data: { status: "PENDING", paidAt: null } });
      return NextResponse.json(await prisma.financialEntry.update({ where: { id, unitId: unit.id }, data: { status: "OPEN", paidAt: null, paidAmount: null, payMethod: null } }));
    }
    if (action === "cancel") {
      if (entry.status !== "OPEN") return NextResponse.json({ error: "Só lançamentos em aberto podem ser cancelados" }, { status: 409 });
      return NextResponse.json(await prisma.financialEntry.update({ where: { id, unitId: unit.id }, data: { status: "CANCELLED" } }));
    }
    if (action) return NextResponse.json({ error: "Ação inválida" }, { status: 400 });

    if (entry.status !== "OPEN") return NextResponse.json({ error: "Reabra o lançamento para editar" }, { status: 409 });
    const d = editSchema.parse(body);
    // Entregas e pedidos faturados: valor/vencimento/descrição vêm da origem (seriam refeitos no próximo fechamento)
    if ((entry.source === "COURIER" || entry.source === "ORDER") && (d.amount !== undefined || d.dueDate !== undefined || d.description !== undefined)) {
      return NextResponse.json({ error: "Lançamento automático: só observações e centro de custo podem ser editados" }, { status: 409 });
    }
    const bad = await checkOwnership(unit.id, d);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const updated = await prisma.financialEntry.update({
      where: { id, unitId: unit.id },
      data: {
        ...(d.description !== undefined && { description: d.description }),
        ...(d.amount !== undefined && { amount: d.amount }),
        ...(d.dueDate !== undefined && { dueDate: parseDateOnly(d.dueDate) }),
        ...(d.supplierId !== undefined && { supplierId: d.supplierId }),
        ...(d.customerId !== undefined && { customerId: d.customerId }),
        ...(d.costCenterId !== undefined && { costCenterId: d.costCenterId }),
        ...(d.notes !== undefined && { notes: d.notes }),
      },
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "Já existe lançamento desta recorrência nesta data" }, { status: 409 });
    console.error("[financeiro/lancamentos/id]", e);
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

// Só lançamentos manuais em aberto/cancelados. Recorrentes, automáticos e pagos: cancele (excluir faria a recorrência recriar).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const entry = await prisma.financialEntry.findFirst({ where: { id, unitId: auth.unit.id } });
  if (!entry) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
  if (entry.source !== "MANUAL") return NextResponse.json({ error: "Lançamento automático: cancele em vez de excluir" }, { status: 409 });
  if (entry.status === "PAID") return NextResponse.json({ error: "Lançamento pago: reabra antes de excluir" }, { status: 409 });

  await prisma.financialEntry.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
