import { headers } from "next/headers";
import { prisma } from "./prisma";
import { HQ_SLUG, UNIT_HEADER } from "./unit-host";

type UnitRow = { id: string; brandId: string; type: "HQ" | "FRANCHISE"; name: string; slug: string; active: boolean };

// Cache curto em memória: unidades mudam raramente e toda request precisa delas
const cache = new Map<string, { unit: UnitRow | null; exp: number }>();
const TTL_MS = 60_000;

export async function getUnitBySlug(slug: string): Promise<UnitRow | null> {
  const hit = cache.get(slug);
  if (hit && hit.exp > Date.now()) return hit.unit;
  const unit = await prisma.unit.findUnique({ where: { slug } });
  const value = unit && unit.active ? (unit as UnitRow) : null;
  cache.set(slug, { unit: value, exp: Date.now() + TTL_MS });
  return value;
}

export function clearUnitCache() {
  cache.clear();
}

/** Unidade da request atual (definida pelo proxy). null = subdomínio desconhecido ou inativo. */
export async function getCurrentUnit(): Promise<UnitRow | null> {
  const h = await headers();
  return getUnitBySlug(h.get(UNIT_HEADER) ?? HQ_SLUG);
}

export class UnitNotFoundError extends Error {
  constructor() {
    super("Unidade não encontrada");
  }
}

/** Como getCurrentUnit, mas lança se a unidade não existir — para rotas de API. */
export async function requireUnit(): Promise<UnitRow> {
  const unit = await getCurrentUnit();
  if (!unit) throw new UnitNotFoundError();
  return unit;
}
