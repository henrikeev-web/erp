/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";
import { announceToUnit } from "./announcements";

/**
 * PREMIAÇÕES: metas que a matriz define para as franquias (ex.: primeiros 1.000 pedidos, primeiros R$ 10.000 em
 * vendas), com janela de datas opcional. Conta pedidos da franquia NÃO cancelados. A conquista é registrada uma vez
 * por (premiação, franquia), no instante em que a meta foi cruzada, e gera um pop-up de parabéns para a franquia.
 * Cancelar pedido depois NÃO revoga a conquista.
 */

export interface AwardLike { metric: "ORDERS" | "SALES"; threshold: number; startsAt: Date | null; endsAt: Date | null }

/** Soma/contagem dentro da janela e o instante em que a meta foi cruzada (null se ainda não). */
export function computeProgress(award: AwardLike, orders: { total: number; createdAt: Date }[]) {
  let value = 0;
  let achievedAt: Date | null = null;
  for (const o of orders) {
    if (award.startsAt && o.createdAt < award.startsAt) continue;
    if (award.endsAt && o.createdAt > award.endsAt) continue;
    value = Math.round((value + (award.metric === "ORDERS" ? 1 : o.total)) * 100) / 100; // em centavos: 0,1 + 0,2 bate a meta de 0,3
    if (!achievedAt && value >= award.threshold) achievedAt = o.createdAt;
  }
  return { value: Math.round(value * 100) / 100, achievedAt };
}

const fmtValue = (a: { metric: string; threshold: number }) => (a.metric === "ORDERS" ? `${a.threshold.toLocaleString("pt-BR")} pedidos` : `R$ ${a.threshold.toLocaleString("pt-BR")} em vendas`);

async function ordersOf(unitId: string) {
  return prisma.order.findMany({ where: { unitId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" }, select: { total: true, createdAt: true } }) as Promise<{ total: number; createdAt: Date }[]>;
}

/** Avalia as premiações ativas para UMA franquia; registra as conquistas novas e avisa. Devolve quantas foram. */
export async function evaluateAwards(unitId: string): Promise<number> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, brandId: true, type: true, name: true } });
  if (!unit || unit.type !== "FRANCHISE") return 0;

  const awards: any[] = await prisma.award.findMany({ where: { brandId: unit.brandId, active: true, grants: { none: { unitId } } } });
  if (awards.length === 0) return 0;

  const orders = await ordersOf(unitId);
  let granted = 0;
  for (const a of awards) {
    const { value, achievedAt } = computeProgress(a, orders);
    if (!achievedAt) continue;
    try {
      await prisma.awardGrant.create({ data: { awardId: a.id, unitId, achievedAt, value } });
    } catch (e: any) {
      if (e?.code === "P2002") continue; // avaliação simultânea já registrou
      throw e;
    }
    await announceToUnit({
      brandId: unit.brandId, unitId, source: "AWARD", kind: "POPUP", level: "SUCCESS",
      title: `🏆 Premiação conquistada: ${a.name}`,
      body: `Parabéns! A ${unit.name} atingiu a meta de ${fmtValue(a)}.${a.reward ? `\n\nPrêmio: ${a.reward}` : ""}\n\nA matriz entrará em contato para a entrega.`,
    });
    granted++;
  }
  return granted;
}

export async function evaluateAllFranchises(brandId: string): Promise<number> {
  const units = await prisma.unit.findMany({ where: { brandId, type: "FRANCHISE", active: true }, select: { id: true } });
  let n = 0;
  for (const u of units) n += await evaluateAwards(u.id);
  return n;
}

/** Progresso de uma franquia em cada premiação (inclui as já conquistadas). */
export async function progressFor(unitId: string, awards: any[]) {
  const orders = await ordersOf(unitId);
  return awards.map((a) => {
    const { value, achievedAt } = computeProgress(a, orders);
    return { awardId: a.id, value, pct: Math.min(100, Math.round((value / a.threshold) * 100)), achievedAt };
  });
}
