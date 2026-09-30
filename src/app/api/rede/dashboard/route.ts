/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { brDate, brRange } from "@/lib/courier";
import { parseDateOnly, todayUTC } from "@/lib/financeiro";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pctChange = (cur: number, prev: number) => (prev > 0 ? r2(((cur - prev) / prev) * 100) : cur > 0 ? null : 0); // null = sem base de comparação

const addDays = (ymd: string, n: number) => { const d = parseDateOnly(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((parseDateOnly(b).getTime() - parseDateOnly(a).getTime()) / 86_400_000) + 1;

/**
 * Dashboard da REDE (só administrador da matriz): desempenho de cada unidade no período, comparado ao período
 * anterior de mesmo tamanho. "Vendas" = pedidos de CONSUMIDOR não cancelados; a reposição (franquia comprando da
 * matriz) fica separada e não conta como venda ao consumidor, nem na matriz nem na franquia.
 */
export async function GET(req: NextRequest) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const brandId = auth.unit.brandId;

  const sp = new URL(req.url).searchParams;
  const today = brDate(new Date());
  const ate = sp.get("ate") ?? today;
  const de = sp.get("de") ?? addDays(ate, -29);
  let from: Date, to: Date, prevFrom: Date, prevTo: Date;
  try {
    if (de > ate) return NextResponse.json({ error: "A data inicial é maior que a final" }, { status: 400 });
    const n = daysBetween(de, ate);
    if (n > 366) return NextResponse.json({ error: "Período máximo: 1 ano" }, { status: 400 });
    [from, to] = brRange(de, ate);
    [prevFrom, prevTo] = brRange(addDays(de, -n), addDays(de, -1));
  } catch { return NextResponse.json({ error: "Período inválido (use AAAA-MM-DD)" }, { status: 400 }); }

  const units: any[] = await prisma.unit.findMany({ where: { brandId }, select: { id: true, name: true, slug: true, type: true, active: true, city: true, state: true }, orderBy: { name: "asc" } });

  const [orders, repOrders, newCustomers, stocks, finance, items]: any[] = await Promise.all([
    prisma.order.findMany({ where: { brandId, createdAt: { gte: prevFrom, lte: to }, priceTier: { not: "FRANCHISE" } }, select: { unitId: true, total: true, status: true, createdAt: true } }),
    // Reposição: pedidos na matriz em nome do franqueado, atribuídos à franquia que comprou
    prisma.order.findMany({ where: { brandId, priceTier: "FRANCHISE", status: { not: "CANCELLED" }, createdAt: { gte: from, lte: to } }, select: { total: true, customer: { select: { franchiseUnitId: true } } } }),
    prisma.customer.groupBy({ by: ["unitId"], where: { brandId, createdAt: { gte: from, lte: to }, type: { not: "FRANCHISEE" } }, _count: true }),
    prisma.stockItem.findMany({ where: { product: { brandId, active: true } }, select: { quantity: true, minQuantity: true, product: { select: { unitId: true } } } }),
    prisma.financialEntry.findMany({ where: { unit: { brandId }, status: "OPEN" }, select: { unitId: true, type: true, amount: true, dueDate: true } }),
    prisma.orderItem.findMany({ where: { order: { brandId, createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" }, priceTier: { not: "FRANCHISE" } } }, select: { name: true, quantity: true, total: true } }),
  ]);

  const todayDate = todayUTC();
  const inPeriod = (d: Date) => d >= from && d <= to;
  const rows = units.map((u) => {
    const mine = orders.filter((o: any) => o.unitId === u.id);
    const cur = mine.filter((o: any) => inPeriod(o.createdAt));
    const prev = mine.filter((o: any) => !inPeriod(o.createdAt));
    const ok = (xs: any[]) => xs.filter((o) => o.status !== "CANCELLED");
    const sum = (xs: any[]) => r2(xs.reduce((s, o) => s + o.total, 0));
    const curOk = ok(cur), prevOk = ok(prev);
    const sales = sum(curOk), prevSales = sum(prevOk);
    const fin = finance.filter((f: any) => f.unitId === u.id);
    const fsum = (type: string, overdue: boolean) => r2(fin.filter((f: any) => f.type === type && (!overdue || f.dueDate < todayDate)).reduce((s: number, f: any) => s + f.amount, 0));
    const low = stocks.filter((s: any) => s.product.unitId === u.id && s.quantity <= s.minQuantity).length;
    return {
      ...u,
      orders: curOk.length, sales, avgTicket: curOk.length ? r2(sales / curOk.length) : 0,
      cancelled: cur.length - curOk.length, cancelRate: cur.length ? r2(((cur.length - curOk.length) / cur.length) * 100) : 0,
      prevOrders: prevOk.length, prevSales, salesChange: pctChange(sales, prevSales), ordersChange: pctChange(curOk.length, prevOk.length),
      newCustomers: newCustomers.find((c: any) => c.unitId === u.id)?._count ?? 0,
      replenishment: u.type === "FRANCHISE" ? r2(repOrders.filter((o: any) => o.customer?.franchiseUnitId === u.id).reduce((s: number, o: any) => s + o.total, 0)) : null,
      lowStock: low,
      finance: { payableOpen: fsum("PAYABLE", false), payableOverdue: fsum("PAYABLE", true), receivableOpen: fsum("RECEIVABLE", false), receivableOverdue: fsum("RECEIVABLE", true) },
    };
  }).sort((a, b) => b.sales - a.sales);

  // Série diária de vendas por unidade
  const days: string[] = []; for (let d = de; d <= ate; d = addDays(d, 1)) days.push(d);
  const series = days.map((day) => {
    const row: Record<string, any> = { day };
    for (const u of units) row[u.id] = 0;
    for (const o of orders) if (o.status !== "CANCELLED" && inPeriod(o.createdAt) && brDate(o.createdAt) === day) row[o.unitId] = r2(row[o.unitId] + o.total);
    return row;
  });

  const top = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const i of items) { const t = top.get(i.name) ?? { name: i.name, quantity: 0, revenue: 0 }; t.quantity += i.quantity; t.revenue = r2(t.revenue + i.total); top.set(i.name, t); }

  const tot = (k: "sales" | "orders" | "prevSales" | "prevOrders" | "newCustomers" | "cancelled") => rows.reduce((s, r: any) => s + r[k], 0);
  const salesAll = r2(tot("sales")), ordersAll = tot("orders");
  const cancelledAll = tot("cancelled");
  return NextResponse.json({
    de, ate, days: days.length,
    totals: {
      sales: salesAll, orders: ordersAll, avgTicket: ordersAll ? r2(salesAll / ordersAll) : 0,
      salesChange: pctChange(salesAll, r2(tot("prevSales"))), ordersChange: pctChange(ordersAll, tot("prevOrders")),
      cancelRate: ordersAll + cancelledAll ? r2((cancelledAll / (ordersAll + cancelledAll)) * 100) : 0,
      newCustomers: tot("newCustomers"),
      replenishment: r2(repOrders.reduce((s: number, o: any) => s + o.total, 0)),
      activeFranchises: units.filter((u) => u.type === "FRANCHISE" && u.active).length,
    },
    units: rows, series,
    topProducts: [...top.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
  });
}
