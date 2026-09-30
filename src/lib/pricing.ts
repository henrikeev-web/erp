import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { PUBLIC_PRODUCT_OMIT, RESELLER_PRODUCT_OMIT } from "./product-fields";

/**
 * PREÇO DE REVENDA — regra de sigilo.
 * `Product.resalePrice` só chega ao navegador de um REVENDEDOR cadastrado e logado. Nunca de outro
 * cliente, visitante, WhatsApp ou API pública. O nível de preço é decidido AQUI, no servidor, a partir
 * da sessão + banco (Customer.type) — jamais de algo enviado pelo cliente (body, query, cookie, header).
 */

export type PricingTier = "RETAIL" | "RESELLER";

/** Nível de preço da requisição atual (sessão de cliente da unidade, tipo lido do banco a cada chamada). */
export async function getSessionPricing(unitId: string): Promise<{ tier: PricingTier; customerId: string | null }> {
  const session = await getServerSession(authOptions);
  const u = session?.user;
  if (!u || u.role !== "CUSTOMER" || u.unitId !== unitId) return { tier: "RETAIL", customerId: null };

  // Lido do banco (não do JWT): se o admin remover a condição de revendedor, vale na hora
  const c = await prisma.customer.findFirst({ where: { id: u.id, unitId, active: true }, select: { id: true, type: true } });
  if (!c) return { tier: "RETAIL", customerId: null };
  return { tier: c.type === "RESELLER" ? "RESELLER" : "RETAIL", customerId: c.id };
}

/** Argumento `omit` das consultas públicas de produto para o nível informado. */
export const productOmitFor = (tier: PricingTier) => (tier === "RESELLER" ? RESELLER_PRODUCT_OMIT : PUBLIC_PRODUCT_OMIT);

type WithPrice = { price: number; priceOriginal?: number | null; resalePrice?: number | null };

/**
 * Aplica o nível de preço a um produto que vai para o navegador.
 * RESELLER: `price` vira o preço de revenda (ou o normal, se o produto não tiver), `priceOriginal` some.
 * Em qualquer nível o campo `resalePrice` é REMOVIDO do resultado.
 */
// Tipado como T (resalePrice é opcional no tipo): o campo é removido em tempo de execução.
export function applyTierPricing<T extends WithPrice>(product: T, tier: PricingTier): T {
  const { resalePrice, ...rest } = product;
  if (tier === "RESELLER") {
    return { ...rest, price: resalePrice ?? product.price, ...("priceOriginal" in rest ? { priceOriginal: null } : {}) } as T;
  }
  return rest as T;
}
