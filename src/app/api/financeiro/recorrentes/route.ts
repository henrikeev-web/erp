/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { checkOwnership, isoDate, materializeRecurring, parseDateOnly, recurringSchema } from "@/lib/financeiro";

export const dynamic = "force-dynamic";
const ROLES = ["SUPER_ADMIN", "ADMIN"];

const recurringInclude = {
  supplier: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  costCenter: { select: { id: true, name: true } },
};

const serializeRecurring = (r: any) => ({ ...r, startDate: isoDate(r.startDate), endDate: r.endDate ? isoDate(r.endDate) : null });

export async function GET() {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const list = await prisma.recurringEntry.findMany({ where: { unitId: auth.unit.id }, include: recurringInclude, orderBy: [{ active: "desc" }, { description: "asc" }] });
  return NextResponse.json(list.map(serializeRecurring));
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;
  try {
    const d = recurringSchema.parse(await req.json());
    const bad = await checkOwnership(unit.id, d);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    if (d.type === "PAYABLE" && d.customerId) return NextResponse.json({ error: "Conta a pagar não tem cliente" }, { status: 400 });
    if (d.type === "RECEIVABLE" && d.supplierId) return NextResponse.json({ error: "Conta a receber não tem fornecedor" }, { status: 400 });
    const start = parseDateOnly(d.startDate);
    const end = d.endDate ? parseDateOnly(d.endDate) : null;
    if (end && end < start) return NextResponse.json({ error: "O fim é anterior ao início" }, { status: 400 });

    const created = await prisma.recurringEntry.create({
      data: { unitId: unit.id, type: d.type, description: d.description, amount: d.amount, every: d.every, period: d.period, startDate: start, endDate: end, notes: d.notes ?? null, supplierId: d.supplierId ?? null, customerId: d.customerId ?? null, costCenterId: d.costCenterId ?? null },
    });
    await materializeRecurring(unit.id);
    return NextResponse.json(serializeRecurring(created), { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[financeiro/recorrentes]", e);
    return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
  }
}
