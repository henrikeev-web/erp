import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { addDaysUTC, materializeRecurring, todayUTC } from "@/lib/financeiro";

export const dynamic = "force-dynamic";

const r2 = (n: number | null | undefined) => Math.round((n ?? 0) * 100) / 100;

// Painel do financeiro: em aberto, vencido, próximos 7 dias, realizado no mês, projeção 30 dias e despesas por centro de custo
export async function GET() {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const unitId = auth.unit.id;
  await materializeRecurring(unitId);

  const today = todayUTC();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const in7 = addDaysUTC(today, 7);
  const in30 = addDaysUTC(today, 30);

  const sum = (where: object) => prisma.financialEntry.aggregate({ where: { unitId, ...where }, _sum: { amount: true }, _count: true });
  const sumPaid = (where: object) => prisma.financialEntry.aggregate({ where: { unitId, status: "PAID", ...where }, _sum: { paidAmount: true }, _count: true });

  const [pOpen, pOver, p7, p30, rOpen, rOver, r7, r30, pPaidMonth, rPaidMonth, byCc] = await Promise.all([
    sum({ type: "PAYABLE", status: "OPEN" }),
    sum({ type: "PAYABLE", status: "OPEN", dueDate: { lt: today } }),
    sum({ type: "PAYABLE", status: "OPEN", dueDate: { gte: today, lte: in7 } }),
    sum({ type: "PAYABLE", status: "OPEN", dueDate: { lte: in30 } }),
    sum({ type: "RECEIVABLE", status: "OPEN" }),
    sum({ type: "RECEIVABLE", status: "OPEN", dueDate: { lt: today } }),
    sum({ type: "RECEIVABLE", status: "OPEN", dueDate: { gte: today, lte: in7 } }),
    sum({ type: "RECEIVABLE", status: "OPEN", dueDate: { lte: in30 } }),
    sumPaid({ type: "PAYABLE", paidAt: { gte: monthStart, lte: monthEnd } }),
    sumPaid({ type: "RECEIVABLE", paidAt: { gte: monthStart, lte: monthEnd } }),
    prisma.financialEntry.groupBy({
      by: ["costCenterId"],
      where: { unitId, type: "PAYABLE", status: { not: "CANCELLED" }, dueDate: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
  ]);

  const centers = await prisma.costCenter.findMany({ where: { unitId }, select: { id: true, name: true } });
  const ccName = new Map<string, string>(centers.map((c: { id: string; name: string }) => [c.id, c.name]));

  const box = (a: { _sum: { amount: number | null }; _count: number }) => ({ amount: r2(a._sum.amount), count: a._count });
  return NextResponse.json({
    today: today.toISOString().slice(0, 10),
    payable: { open: box(pOpen), overdue: box(pOver), next7: box(p7), upTo30: box(p30) },
    receivable: { open: box(rOpen), overdue: box(rOver), next7: box(r7), upTo30: box(r30) },
    // Projeção: tudo em aberto (inclusive vencido) até 30 dias à frente
    projection30: r2((r30._sum.amount ?? 0) - (p30._sum.amount ?? 0)),
    month: { paid: r2(pPaidMonth._sum.paidAmount), received: r2(rPaidMonth._sum.paidAmount) },
    byCostCenter: byCc
      .map((g: { costCenterId: string | null; _sum: { amount: number | null } }) => ({ costCenterId: g.costCenterId, name: g.costCenterId ? ccName.get(g.costCenterId) ?? "—" : "Sem centro de custo", amount: r2(g._sum.amount) }))
      .sort((a: { amount: number }, b: { amount: number }) => b.amount - a.amount),
  });
}
