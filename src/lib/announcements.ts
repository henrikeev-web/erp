/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";

/**
 * AVISOS da matriz para as franquias. POPUP abre uma vez por usuário ao entrar no painel (até confirmar);
 * NOTICE fica no sino. Direcionamento: todas as franquias ou só as escolhidas (AnnouncementTarget).
 */

export function activeWindow(now = new Date()) {
  return { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

/** Avisos visíveis para os usuários de uma unidade (franquia), com o status de leitura de UM usuário. */
export async function visibleAnnouncements(unit: { id: string; brandId: string; type: string }, userId: string) {
  if (unit.type !== "FRANCHISE") return []; // a matriz é quem escreve
  const list: any[] = await prisma.announcement.findMany({
    where: { brandId: unit.brandId, ...activeWindow(), AND: [{ OR: [{ allUnits: true }, { targets: { some: { unitId: unit.id } } }] }] },
    orderBy: { startsAt: "desc" },
    take: 50,
    select: { id: true, title: true, body: true, kind: true, level: true, startsAt: true, source: true, reads: { where: { userId }, select: { readAt: true } } },
  });
  return list.map(({ reads, ...a }) => ({ ...a, read: reads.length > 0 }));
}

/** Aviso direcionado a UMA franquia (usado pelas premiações). */
export async function announceToUnit(a: { brandId: string; unitId: string; title: string; body: string; level?: "INFO" | "SUCCESS" | "WARNING"; kind?: "POPUP" | "NOTICE"; source?: string }) {
  return prisma.announcement.create({
    data: {
      brandId: a.brandId, title: a.title, body: a.body, kind: a.kind ?? "POPUP", level: a.level ?? "INFO", source: a.source ?? "MANUAL",
      allUnits: false, targets: { create: [{ unitId: a.unitId }] },
    },
  });
}
