/* eslint-disable @typescript-eslint/no-explicit-any */
import type { z } from "zod";
import { prisma } from "./prisma";
import { validateComboDefinition } from "./combo";
import type { comboSchema } from "./combo-schema";

export const comboInclude = {
  category: { select: { id: true, name: true } },
  images: { where: { isMain: true }, take: 1, select: { url: true } },
  comboItems: { orderBy: { order: "asc" as const }, include: { product: { select: { id: true, name: true, active: true, price: true, stockItem: { select: { quantity: true } } } } } },
};

/** Confere que categoria e produtos são da unidade e que a composição fecha a quantidade exata. */
export async function checkCombo(unitId: string, d: z.infer<typeof comboSchema>, selfId?: string): Promise<string | null> {
  const def = validateComboDefinition(d.comboSize, d.items);
  if (def) return def;

  const ids = d.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) return "Produto repetido na composição do combo";
  if (selfId && ids.includes(selfId)) return "Um combo não pode conter ele mesmo";

  const products = await prisma.product.findMany({ where: { id: { in: ids }, unitId }, select: { id: true, kind: true } });
  if (products.length !== ids.length) return "Produto inválido na composição";
  if (products.some((p: any) => p.kind !== "SIMPLE")) return "Um combo só pode conter produtos comuns (não outros combos)";

  if (d.categoryId && !(await prisma.category.findFirst({ where: { id: d.categoryId, unitId }, select: { id: true } }))) return "Categoria inválida";
  return null;
}

