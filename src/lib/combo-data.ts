/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";
import { isComboAvailable } from "./combo";
import type { ComboOption } from "./combo";

export interface PublicComboOption {
  productId: string;
  name: string;
  maxQty: number | null;
  stock: number | null;   // null = sem controle de estoque
  soldOut: boolean;       // aparece apagado com "sem estoque" e não pode ser escolhido
  imageUrl: string | null;
}
export interface PublicCombo { size: number; available: boolean; options: PublicComboOption[] }

/**
 * Composição dos combos para o cardápio. Devolve só o necessário para montar o combo: nome, limite, estoque e foto.
 * NENHUM preço de componente (e portanto nenhum preço de revenda) sai daqui.
 */
export async function loadCombos(unitId: string, combos: { id: string; comboSize: number | null }[]): Promise<Map<string, PublicCombo>> {
  const out = new Map<string, PublicCombo>();
  if (combos.length === 0) return out;

  const items: any[] = await prisma.comboItem.findMany({
    where: { comboId: { in: combos.map((c) => c.id) } },
    orderBy: { order: "asc" },
    select: {
      comboId: true, productId: true, maxQty: true,
      product: { select: { id: true, name: true, active: true, unitId: true, stockItem: { select: { quantity: true } }, images: { where: { isMain: true }, take: 1, select: { url: true } } } },
    },
  });

  for (const c of combos) {
    const size = c.comboSize ?? 0;
    const options = items.filter((i) => i.comboId === c.id).map((i): PublicComboOption & { active: boolean } => {
      const stock = i.product.stockItem ? i.product.stockItem.quantity : null;
      const active = i.product.active && i.product.unitId === unitId;
      return { productId: i.productId, name: i.product.name, maxQty: i.maxQty, stock, active, soldOut: !active || (stock !== null && stock <= 0), imageUrl: i.product.images[0]?.url ?? null };
    });
    const forRules: ComboOption[] = options.map((o) => ({ productId: o.productId, name: o.name, maxQty: o.maxQty, active: o.active, stock: o.stock }));
    out.set(c.id, { size, available: size > 0 && isComboAvailable(forRules, size), options: options.map(({ active: _a, ...o }) => o) });
  }
  return out;
}

/** Acrescenta `combo` aos produtos COMBO de uma lista que vai para o navegador. */
export async function withComboData<T extends { id: string; kind?: string; comboSize?: number | null }>(unitId: string, products: T[]): Promise<(T & { combo?: PublicCombo })[]> {
  const map = await loadCombos(unitId, products.filter((p) => p.kind === "COMBO").map((p) => ({ id: p.id, comboSize: p.comboSize ?? null })));
  return products.map((p) => (map.has(p.id) ? { ...p, combo: map.get(p.id) } : p));
}
