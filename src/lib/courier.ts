/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";
import { parseDateOnly } from "./financeiro";

/**
 * Entregadores: pagos por entrega, valor conforme a região (DeliveryZone.courierFee), gravado no pedido
 * (Order.courierFee) quando o entregador é escolhido. Sem acesso ao sistema.
 * TODO o custo do entregador é dado INTERNO: nunca vai para cliente, checkout, CEP ou zonas públicas.
 */

const BUSINESS_TZ = process.env.BUSINESS_TZ ?? "America/Sao_Paulo";
const BR_OFFSET = "-03:00"; // Brasília não tem horário de verão desde 2019 (mesma convenção do filtro de pedidos)

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Dia (AAAA-MM-DD) de um instante no fuso da operação. */
export const brDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(d);

/** Início e fim (inclusive) de um intervalo de dias AAAA-MM-DD, em horário de Brasília. */
export function brRange(de: string, ate: string): [Date, Date] {
  parseDateOnly(de); parseDateOnly(ate); // valida
  return [new Date(`${de}T00:00:00${BR_OFFSET}`), new Date(`${ate}T23:59:59.999${BR_OFFSET}`)];
}

const addDays = (ymd: string, n: number) => {
  const d = parseDateOnly(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const fmtBr = (ymd: string) => ymd.split("-").reverse().join("/");

export const COURIER_COST_CENTER = "Entregadores";
const WINDOW_DAYS = 90;
const THROTTLE_MS = 30_000;
const lastRun = new Map<string, number>();

/**
 * Fecha os dias já encerrados: para cada (entregador, dia) soma o custo das entregas ENTREGUES nesse dia
 * e mantém UMA conta a pagar (source COURIER, sourceKey courier:<id>:<dia>, vencimento no próprio dia).
 *  - Dia corrente não entra (ainda está aberto); entra na virada, na próxima consulta.
 *  - Idempotente (sourceKey único). Conta ainda ABERTA é recalculada/removida se as entregas mudaram
 *    (troca de entregador, cancelamento); conta já PAGA ou CANCELADA nunca é tocada.
 *  - Roda sob demanda (financeiro/relatório) e no máximo a cada 30 s por unidade. Sem cron.
 */
export async function syncCourierPayables(unitId: string, opts: { force?: boolean } = {}) {
  const now = Date.now();
  if (!opts.force && now - (lastRun.get(unitId) ?? 0) < THROTTLE_MS) return;
  lastRun.set(unitId, now);

  try {
    const today = brDate(new Date());
    const firstDay = addDays(today, -WINDOW_DAYS);
    const from = new Date(`${firstDay}T00:00:00${BR_OFFSET}`);
    const until = new Date(`${today}T00:00:00${BR_OFFSET}`); // exclusivo: dia corrente fica de fora

    const orders = await prisma.order.findMany({
      where: { unitId, status: "DELIVERED", courierId: { not: null }, courierFee: { gt: 0 }, deliveredAt: { gte: from, lt: until } },
      select: { courierId: true, courierFee: true, deliveredAt: true },
    });

    const groups = new Map<string, { courierId: string; day: string; count: number; sum: number }>();
    for (const o of orders as any[]) {
      const day = brDate(o.deliveredAt);
      const key = `courier:${o.courierId}:${day}`;
      const g = groups.get(key) ?? { courierId: o.courierId, day, count: 0, sum: 0 };
      g.count += 1; g.sum += o.courierFee;
      groups.set(key, g);
    }

    const existing = await prisma.financialEntry.findMany({
      where: { unitId, source: "COURIER", dueDate: { gte: parseDateOnly(firstDay), lt: parseDateOnly(today) } },
      select: { id: true, sourceKey: true, status: true, amount: true },
    });
    const byKey = new Map<string, any>((existing as any[]).map((e) => [e.sourceKey, e]));

    if (groups.size > 0) {
      let cc = await prisma.costCenter.findFirst({ where: { unitId, name: COURIER_COST_CENTER }, select: { id: true } });
      if (!cc) {
        try { cc = await prisma.costCenter.create({ data: { unitId, name: COURIER_COST_CENTER }, select: { id: true } }); }
        catch { cc = await prisma.costCenter.findFirst({ where: { unitId, name: COURIER_COST_CENTER }, select: { id: true } }); }
      }
      const couriers = await prisma.courier.findMany({ where: { unitId, id: { in: [...new Set([...groups.values()].map((g) => g.courierId))] } }, select: { id: true, name: true } });
      const name = new Map<string, string>((couriers as any[]).map((c) => [c.id, c.name]));

      for (const [key, g] of groups) {
        const amount = r2(g.sum);
        const description = `Entregas — ${name.get(g.courierId) ?? "entregador"} — ${fmtBr(g.day)} (${g.count} ${g.count === 1 ? "entrega" : "entregas"})`;
        const ex = byKey.get(key);
        if (!ex) {
          try {
            await prisma.financialEntry.create({
              data: { unitId, type: "PAYABLE", description, amount, dueDate: parseDateOnly(g.day), courierId: g.courierId, costCenterId: cc?.id, source: "COURIER", sourceKey: key },
            });
          } catch (e: any) { if (e?.code !== "P2002") throw e; } // outra consulta simultânea já criou
        } else if (ex.status === "OPEN" && ex.amount !== amount) {
          await prisma.financialEntry.update({ where: { id: ex.id, unitId }, data: { amount, description } });
        }
      }
    }

    // Conta aberta cujo dia não tem mais entregas (trocou de entregador/cancelou): remove
    for (const [key, ex] of byKey) {
      if (!groups.has(key) && ex.status === "OPEN") await prisma.financialEntry.delete({ where: { id: ex.id, unitId } });
    }
  } catch (e) {
    lastRun.delete(unitId); // tenta de novo na próxima consulta; nunca derruba a tela do financeiro
    console.error("[courier] falha ao fechar dias:", e);
  }
}
