/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { checkOwnership, materializeRecurring, parseDateOnly, recurringSchema, todayUTC } from "@/lib/financeiro";

const ROLES = ["SUPER_ADMIN", "ADMIN"];
const patchSchema = recurringSchema.partial().extend({ active: z.boolean().optional() });

/**
 * Edição da recorrência.
 *  - Mudou o calendário (frequência, início, fim) ou desativou: descarta as cobranças estritamente FUTURAS em
 *    aberto (ainda não são reais) e regenera. Pagas e vencidas ficam intocadas.
 *  - Mudou só valor/descrição/vínculos: atualiza as cobranças futuras em aberto.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;
  const { id } = await params;

  const t = await prisma.recurringEntry.findFirst({ where: { id, unitId: unit.id } });
  if (!t) return NextResponse.json({ error: "Recorrência não encontrada" }, { status: 404 });

  try {
    const d = patchSchema.parse(await req.json());
    const bad = await checkOwnership(unit.id, d);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    const start = d.startDate ? parseDateOnly(d.startDate) : t.startDate;
    const end = d.endDate === undefined ? t.endDate : d.endDate ? parseDateOnly(d.endDate) : null;
    if (end && end < start) return NextResponse.json({ error: "O fim é anterior ao início" }, { status: 400 });

    const scheduleChanged =
      (d.every !== undefined && d.every !== t.every) || (d.period !== undefined && d.period !== t.period) ||
      start.getTime() !== t.startDate.getTime() || (end?.getTime() ?? null) !== (t.endDate?.getTime() ?? null);
    const deactivating = d.active === false && t.active;

    const data = {
      ...(d.description !== undefined && { description: d.description }),
      ...(d.amount !== undefined && { amount: d.amount }),
      ...(d.every !== undefined && { every: d.every }),
      ...(d.period !== undefined && { period: d.period }),
      startDate: start, endDate: end,
      ...(d.active !== undefined && { active: d.active }),
      ...(d.supplierId !== undefined && { supplierId: d.supplierId }),
      ...(d.customerId !== undefined && { customerId: d.customerId }),
      ...(d.costCenterId !== undefined && { costCenterId: d.costCenterId }),
      ...(d.notes !== undefined && { notes: d.notes }),
    };

    const today = todayUTC();
    // Descarte: só cobranças ESTRITAMENTE futuras (a que vence hoje já é real). Atualização de campos inclui hoje.
    const base = { recurringId: id, unitId: unit.id, status: "OPEN" as const };
    const futureOpen = { ...base, dueDate: { gt: today } };
    const currentAndFutureOpen = { ...base, dueDate: { gte: today } };

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      const u = await tx.recurringEntry.update({ where: { id, unitId: unit.id }, data });
      if (scheduleChanged || deactivating) {
        await tx.financialEntry.deleteMany({ where: futureOpen });
      } else if (d.amount !== undefined || d.description !== undefined || d.supplierId !== undefined || d.customerId !== undefined || d.costCenterId !== undefined) {
        await tx.financialEntry.updateMany({
          where: currentAndFutureOpen,
          data: {
            ...(d.amount !== undefined && { amount: d.amount }),
            ...(d.description !== undefined && { description: d.description }),
            ...(d.supplierId !== undefined && { supplierId: d.supplierId }),
            ...(d.customerId !== undefined && { customerId: d.customerId }),
            ...(d.costCenterId !== undefined && { costCenterId: d.costCenterId }),
          },
        });
      }
      return u;
    });

    await materializeRecurring(unit.id);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[financeiro/recorrentes/id]", e);
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

// Exclui a recorrência e as cobranças estritamente futuras em aberto; o histórico e a que vence hoje permanecem.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const t = await prisma.recurringEntry.findFirst({ where: { id, unitId: auth.unit.id }, select: { id: true } });
  if (!t) return NextResponse.json({ error: "Recorrência não encontrada" }, { status: 404 });

  await (prisma as any).$transaction([
    prisma.financialEntry.deleteMany({ where: { recurringId: id, unitId: auth.unit.id, status: "OPEN", dueDate: { gt: todayUTC() } } }),
    prisma.recurringEntry.delete({ where: { id, unitId: auth.unit.id } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
