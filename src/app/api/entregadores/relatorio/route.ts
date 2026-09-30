import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { brDate, syncCourierPayables } from "@/lib/courier";
import { buildCourierReports } from "@/lib/courier-report";

export const dynamic = "force-dynamic";

// Relatório de entregas por entregador (ADMIN: tem valores a pagar). ?de=&ate= (AAAA-MM-DD, horário de Brasília) &entregadorId=
export async function GET(req: NextRequest) {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const sp = new URL(req.url).searchParams;
  const today = brDate(new Date());
  const de = sp.get("de") ?? today;
  const ate = sp.get("ate") ?? today;

  let reports;
  try {
    if (de > ate) return NextResponse.json({ error: "A data inicial é maior que a final" }, { status: 400 });
    await syncCourierPayables(auth.unit.id); // garante que os dias fechados já estejam no financeiro
    reports = await buildCourierReports(auth.unit.id, de, ate, sp.get("entregadorId") ?? undefined);
  } catch {
    return NextResponse.json({ error: "Período inválido (use AAAA-MM-DD)" }, { status: 400 });
  }

  // Pedidos de entrega já atribuídos e ainda em rota (não entram no relatório até a entrega)
  const inRoute = await prisma.order.count({ where: { unitId: auth.unit.id, type: "DELIVERY", courierId: { not: null }, status: { in: ["IN_PRODUCTION", "READY", "DISPATCHED"] } } });

  const totals = reports.reduce((t, r) => ({ count: t.count + r.totals.count, total: t.total + r.totals.total, feesCharged: t.feesCharged + r.totals.feesCharged }), { count: 0, total: 0, feesCharged: 0 });
  const rounded = { count: totals.count, total: Math.round(totals.total * 100) / 100, feesCharged: Math.round(totals.feesCharged * 100) / 100 };
  return NextResponse.json({ de, ate, today, couriers: reports, totals: { ...rounded, margin: Math.round((rounded.feesCharged - rounded.total) * 100) / 100 }, inRoute });
}
