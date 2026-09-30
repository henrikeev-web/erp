/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { checkOwnership, entrySchema, isoDate, materializeRecurring, addMonthsUTC, parseDateOnly, todayUTC } from "@/lib/financeiro";

export const dynamic = "force-dynamic";
const ROLES = ["SUPER_ADMIN", "ADMIN"]; // financeiro não é do STAFF operacional

const include = {
  supplier: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  costCenter: { select: { id: true, name: true } },
};

// Filtros: tipo, status (OPEN|PAID|CANCELLED|OVERDUE), de/ate (vencimento), fornecedorId, clienteId, centroCustoId, q
export async function GET(req: NextRequest) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;

  await materializeRecurring(unit.id);

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const today = todayUTC();
  const dueDate: Record<string, Date> = {};
  try {
    if (sp.get("de")) dueDate.gte = parseDateOnly(sp.get("de")!);
    if (sp.get("ate")) dueDate.lte = parseDateOnly(sp.get("ate")!);
  } catch {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  }
  if (status === "OVERDUE") dueDate.lt = today;

  const where: Record<string, unknown> = {
    unitId: unit.id,
    ...(sp.get("tipo") && { type: sp.get("tipo") }),
    ...(status && { status: status === "OVERDUE" ? "OPEN" : status }),
    ...(Object.keys(dueDate).length && { dueDate }),
    ...(sp.get("fornecedorId") && { supplierId: sp.get("fornecedorId") }),
    ...(sp.get("clienteId") && { customerId: sp.get("clienteId") }),
    ...(sp.get("centroCustoId") && { costCenterId: sp.get("centroCustoId") }),
    ...(sp.get("q") && { description: { contains: sp.get("q"), mode: "insensitive" } }),
  };

  const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
  const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50")));

  const [entries, agg] = await Promise.all([
    prisma.financialEntry.findMany({ where, include, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.financialEntry.aggregate({ where, _sum: { amount: true }, _count: true }),
  ]);

  return NextResponse.json({
    entries: entries.map((e: any) => ({ ...e, dueDate: isoDate(e.dueDate), paidAt: e.paidAt ? isoDate(e.paidAt) : null, overdue: e.status === "OPEN" && e.dueDate < today })),
    total: agg._count,
    totalAmount: Math.round((agg._sum.amount ?? 0) * 100) / 100,
    page, limit,
  });
}

// Cria lançamento único, parcelado (installments) ou recorrente (recurrence)
export async function POST(req: NextRequest) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { unit, userId } = auth;

  try {
    const d = entrySchema.parse(await req.json());
    const bad = await checkOwnership(unit.id, d);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    // Fornecedor só em conta a pagar, cliente só em a receber
    if (d.type === "PAYABLE" && d.customerId) return NextResponse.json({ error: "Conta a pagar não tem cliente" }, { status: 400 });
    if (d.type === "RECEIVABLE" && d.supplierId) return NextResponse.json({ error: "Conta a receber não tem fornecedor" }, { status: 400 });

    const refs = { supplierId: d.supplierId ?? null, customerId: d.customerId ?? null, costCenterId: d.costCenterId ?? null };
    const due = parseDateOnly(d.dueDate);

    if (d.recurrence) {
      if (d.installments && d.installments > 1) return NextResponse.json({ error: "Escolha parcelamento ou recorrência, não ambos" }, { status: 400 });
      const end = d.recurrence.endDate ? parseDateOnly(d.recurrence.endDate) : null;
      if (end && end < due) return NextResponse.json({ error: "O fim da recorrência é anterior ao primeiro vencimento" }, { status: 400 });
      const template = await prisma.recurringEntry.create({
        data: { unitId: unit.id, type: d.type, description: d.description, amount: d.amount, every: d.recurrence.every, period: d.recurrence.period, startDate: due, endDate: end, notes: d.notes ?? null, ...refs },
      });
      await materializeRecurring(unit.id);
      return NextResponse.json({ recurring: template }, { status: 201 });
    }

    const n = d.installments ?? 1;
    const each = Math.floor((d.amount / n) * 100) / 100;
    const data = Array.from({ length: n }, (_, i) => ({
      unitId: unit.id, type: d.type,
      description: n > 1 ? `${d.description} (${i + 1}/${n})` : d.description,
      // a última parcela absorve a diferença de arredondamento: a soma fecha exatamente o total
      amount: i === n - 1 ? Math.round((d.amount - each * (n - 1)) * 100) / 100 : each,
      dueDate: addMonthsUTC(due, i), notes: d.notes ?? null, createdBy: userId, ...refs,
      installmentNumber: n > 1 ? i + 1 : null, installmentTotal: n > 1 ? n : null,
    }));
    await prisma.financialEntry.createMany({ data });
    return NextResponse.json({ created: n }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[financeiro/lancamentos]", e);
    return NextResponse.json({ error: "Erro ao salvar lançamento" }, { status: 500 });
  }
}
