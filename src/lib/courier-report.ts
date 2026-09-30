/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";
import { brDate, brRange } from "./courier";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DeliveryRow { orderId: string; number: number; deliveredAt: string; day: string; time: string; zone: string | null; neighborhood: string | null; deliveryFee: number; courierFee: number }
export interface DayRow { day: string; count: number; total: number; payable: { id: string; status: string } | null }
export interface CourierReport {
  courier: { id: string; name: string; pixKey: string | null; phone: string | null };
  deliveries: DeliveryRow[];
  days: DayRow[];
  totals: { count: number; total: number; feesCharged: number };
}

/**
 * Entregas ENTREGUES por entregador no período (dia da entrega em horário de Brasília).
 * Traz só o necessário para conferir o pagamento: nº do pedido, dia/hora, região e valores. Sem dados do cliente
 * (o relatório é entregue ao entregador, fora do sistema) — só o bairro.
 */
export async function buildCourierReports(unitId: string, de: string, ate: string, courierId?: string): Promise<CourierReport[]> {
  const [from, to] = brRange(de, ate);
  const orders: any[] = await prisma.order.findMany({
    where: { unitId, status: "DELIVERED", courierId: courierId ?? { not: null }, deliveredAt: { gte: from, lte: to } },
    orderBy: { deliveredAt: "asc" },
    select: {
      id: true, number: true, deliveredAt: true, deliveryFee: true, courierFee: true, courierId: true,
      deliveryZone: { select: { name: true } }, address: { select: { neighborhood: true } },
      courier: { select: { id: true, name: true, pixKey: true, phone: true } },
    },
  });

  const keys = new Set<string>();
  for (const o of orders) keys.add(`courier:${o.courierId}:${brDate(o.deliveredAt)}`);
  const entries: any[] = keys.size
    ? await prisma.financialEntry.findMany({ where: { unitId, source: "COURIER", sourceKey: { in: [...keys] } }, select: { id: true, status: true, sourceKey: true } })
    : [];
  const entryByKey = new Map<string, any>(entries.map((e) => [e.sourceKey, e]));

  const map = new Map<string, CourierReport>();
  for (const o of orders) {
    const day = brDate(o.deliveredAt);
    const rep: CourierReport = map.get(o.courierId) ?? { courier: o.courier, deliveries: [], days: [], totals: { count: 0, total: 0, feesCharged: 0 } };
    const fee = o.courierFee ?? 0;
    rep.deliveries.push({
      orderId: o.id, number: o.number, deliveredAt: o.deliveredAt.toISOString(), day,
      time: new Intl.DateTimeFormat("pt-BR", { timeZone: process.env.BUSINESS_TZ ?? "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(o.deliveredAt),
      zone: o.deliveryZone?.name ?? null, neighborhood: o.address?.neighborhood ?? null, deliveryFee: o.deliveryFee, courierFee: fee,
    });
    rep.totals.count += 1; rep.totals.total += fee; rep.totals.feesCharged += o.deliveryFee;
    map.set(o.courierId, rep);
  }

  for (const rep of map.values()) {
    const byDay = new Map<string, DayRow>();
    for (const d of rep.deliveries) {
      const row = byDay.get(d.day) ?? { day: d.day, count: 0, total: 0, payable: null };
      row.count += 1; row.total += d.courierFee;
      const e = entryByKey.get(`courier:${rep.courier.id}:${d.day}`);
      row.payable = e ? { id: e.id, status: e.status } : null;
      byDay.set(d.day, row);
    }
    rep.days = [...byDay.values()].map((r) => ({ ...r, total: r2(r.total) }));
    rep.totals = { count: rep.totals.count, total: r2(rep.totals.total), feesCharged: r2(rep.totals.feesCharged) };
  }
  return [...map.values()].sort((a, b) => a.courier.name.localeCompare(b.courier.name));
}
