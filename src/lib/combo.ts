/**
 * Regras do COMBO PERSONALIZADO — módulo puro (sem banco), usado pelo servidor (criação do pedido) e pela
 * loja/painel (construtor do combo) para as duas pontas concordarem.
 *
 * Combo = produto de preço FIXO com quantidade EXATA (ex.: 20). O cliente escolhe quanto quer de cada produto
 * da lista do combo, respeitando o limite (maxQty) que o operador definiu para alguns produtos. Produto sem
 * limite vale até completar a quantidade do combo. A baixa de estoque é dos produtos individuais.
 */

export interface ComboOption {
  productId: string;
  name: string;
  maxQty: number | null;       // limite por combo; null = sem limite
  active: boolean;
  stock: number | null;        // null = produto sem controle de estoque (ilimitado)
}

export interface ComboPick { productId: string; quantity: number }

/** Sem estoque (ou inativo): aparece apagado com "sem estoque" e não pode ser escolhido. */
export const isSoldOut = (o: Pick2Availability) => !o.active || (o.stock !== null && o.stock <= 0);
type Pick2Availability = Pick<ComboOption, "active" | "stock">;

/** Quanto DESTE produto cabe em um combo (limite do operador, estoque e o próprio tamanho do combo). */
export function optionCapacity(o: ComboOption, comboSize: number, units = 1): number {
  if (isSoldOut(o)) return 0;
  const byStock = o.stock === null ? Infinity : Math.floor(o.stock / Math.max(1, units));
  return Math.max(0, Math.min(o.maxQty ?? comboSize, comboSize, byStock));
}

/** O combo só pode ser vendido se as opções com estoque somarem ao menos a quantidade exata. */
export function isComboAvailable(options: ComboOption[], comboSize: number): boolean {
  return options.reduce((sum, o) => sum + optionCapacity(o, comboSize), 0) >= comboSize;
}

/**
 * Valida a escolha do cliente. Devolve as escolhas normalizadas (sem zeros, sem repetidos) ou a mensagem de erro.
 * Não checa estoque de pedidos com vários itens (isso é feito no servidor, somando tudo do pedido).
 */
export function validatePicks(options: ComboOption[], comboSize: number, picks: ComboPick[]): { picks: ComboPick[] } | { error: string } {
  const byId = new Map(options.map((o) => [o.productId, o]));
  const merged = new Map<string, number>();

  for (const p of picks) {
    if (!Number.isInteger(p.quantity) || p.quantity < 0) return { error: "Quantidade inválida no combo" };
    if (p.quantity === 0) continue;
    if (!byId.has(p.productId)) return { error: "Produto não faz parte deste combo" };
    merged.set(p.productId, (merged.get(p.productId) ?? 0) + p.quantity);
  }

  let total = 0;
  for (const [productId, quantity] of merged) {
    const o = byId.get(productId)!;
    if (isSoldOut(o)) return { error: `${o.name}: sem estoque` };
    if (o.maxQty !== null && quantity > o.maxQty) return { error: `${o.name}: máximo de ${o.maxQty} por combo` };
    total += quantity;
  }
  if (total !== comboSize) {
    return { error: total < comboSize ? `Escolha mais ${comboSize - total} ${comboSize - total === 1 ? "item" : "itens"} (o combo tem ${comboSize})` : `Você escolheu ${total - comboSize} a mais (o combo tem ${comboSize})` };
  }
  return { picks: [...merged].map(([productId, quantity]) => ({ productId, quantity })) };
}

/**
 * Validação do CADASTRO do combo: os limites do operador precisam permitir fechar a quantidade exata.
 * Ex.: combo de 20 com 2 produtos limitados a 3 cada e mais nada: nunca fecha 20.
 */
export function validateComboDefinition(size: number, items: { maxQty: number | null }[]): string | null {
  if (!Number.isInteger(size) || size < 2 || size > 200) return "Quantidade do combo deve ser um número inteiro de 2 a 200";
  if (items.length === 0) return "Escolha ao menos um produto para compor o combo";
  for (const it of items) {
    if (it.maxQty !== null && (!Number.isInteger(it.maxQty) || it.maxQty < 1)) return "O limite por produto deve ser um número inteiro maior que zero";
  }
  const capacity = items.reduce((s, it) => s + Math.min(it.maxQty ?? size, size), 0);
  if (capacity < size) return `Com estes limites o cliente não consegue completar ${size} itens (soma dos máximos: ${capacity}). Aumente os limites ou inclua mais produtos.`;
  return null;
}
