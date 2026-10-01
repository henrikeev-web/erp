/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "./prisma";

/**
 * CATÁLOGO DA REDE: a matriz é a fonte; cada franquia tem a sua CÓPIA (Product/Category com unitId próprio),
 * ligada ao original por sourceProductId/sourceCategoryId. A sincronização é idempotente e:
 *  - cria o que falta e atualiza o conteúdo (nome, descrição, faixa etária, ingredientes, categoria, combos…);
 *  - NUNCA toca em estoque, em preço de revenda, nem em preço que a franquia já personalizou (priceCustom);
 *  - se a matriz desativa um produto, desativa na franquia (reativar é decisão da franquia);
 *  - não cria produtos/categorias listados em Unit.excludedProductIds/excludedCategoryIds (combo com componente removido também fica de fora).
 */

export interface SyncResult {
  categories: { created: number; updated: number };
  products: { created: number; updated: number };
  combos: { created: number; updated: number; skipped: number };
}

const CONTENT = ["name", "description", "ageMin", "ageMax", "weight", "servings", "ingredients", "allergens", "frozen", "featured", "order"] as const;
const INTERNAL = ["barcode", "ncm", "packWeightG", "packLengthCm", "packWidthCm", "packHeightCm"] as const;
const PRICE = ["price", "priceOriginal"] as const;

const pick = (src: any, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, src[k]]));

/** Fotos da franquia = fotos da matriz (mesmas URLs). Só regrava se mudou, para não mexer à toa. */
async function syncImages(targetProductId: string, hqImages: any[]) {
  const cur: any[] = await prisma.productImage.findMany({ where: { productId: targetProductId }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  const sig = (xs: any[]) => xs.map((i) => `${i.url}|${i.isMain ? 1 : 0}`).sort().join(",");
  if (sig(cur) === sig(hqImages)) return;
  await prisma.productImage.deleteMany({ where: { productId: targetProductId } });
  if (hqImages.length) await prisma.productImage.createMany({ data: hqImages.map((i) => ({ productId: targetProductId, url: i.url, alt: i.alt, isMain: i.isMain, order: i.order })) });
}

// Uma sincronização por unidade de cada vez (o gatilho automático pode disparar várias)
const running = new Map<string, Promise<unknown>>();

export async function syncCatalogToUnit(hqUnitId: string, targetUnitId: string): Promise<SyncResult> {
  const prev = running.get(targetUnitId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => doSync(hqUnitId, targetUnitId));
  running.set(targetUnitId, run);
  try { return await run; } finally { if (running.get(targetUnitId) === run) running.delete(targetUnitId); }
}

async function doSync(hqUnitId: string, targetUnitId: string): Promise<SyncResult> {
  const out: SyncResult = { categories: { created: 0, updated: 0 }, products: { created: 0, updated: 0 }, combos: { created: 0, updated: 0, skipped: 0 } };
  const target = await prisma.unit.findUnique({ where: { id: targetUnitId }, select: { id: true, brandId: true, type: true, excludedProductIds: true, excludedCategoryIds: true } });
  if (!target || target.type !== "FRANCHISE") throw new Error("Unidade de destino inválida");
  const exCats = new Set<string>(target.excludedCategoryIds ?? []);
  const exProds = new Set<string>(target.excludedProductIds ?? []);
  const isExcluded = (p: any) => exProds.has(p.id) || (p.categoryId != null && exCats.has(p.categoryId));

  // ── categorias ──
  const hqCats: any[] = await prisma.category.findMany({ where: { unitId: hqUnitId } });
  const tCats: any[] = await prisma.category.findMany({ where: { unitId: targetUnitId } });
  const catMap = new Map<string, string>(); // id da matriz -> id da franquia
  for (const c of hqCats) {
    if (exCats.has(c.id)) continue; // categoria removida desta franquia
    const content = { name: c.name, imageUrl: c.imageUrl, ageMin: c.ageMin, ageMax: c.ageMax, order: c.order, active: c.active };
    let t = tCats.find((x) => x.sourceCategoryId === c.id) ?? tCats.find((x) => !x.sourceCategoryId && x.slug === c.slug);
    if (t) {
      await prisma.category.update({ where: { id: t.id }, data: { ...content, sourceCategoryId: c.id } });
      out.categories.updated++;
    } else {
      t = await prisma.category.create({ data: { ...content, slug: c.slug, unitId: targetUnitId, sourceCategoryId: c.id } });
      out.categories.created++;
    }
    catMap.set(c.id, t.id);
  }

  // ── produtos comuns ──
  const hqProducts: any[] = await prisma.product.findMany({ where: { unitId: hqUnitId, kind: "SIMPLE" }, include: { images: true }, omit: { resalePrice: true } });
  const tProducts: any[] = await prisma.product.findMany({ where: { unitId: targetUnitId }, select: { id: true, sourceProductId: true, priceCustom: true, active: true } });
  const prodMap = new Map<string, string>();
  for (const p of hqProducts) {
    if (isExcluded(p)) continue; // produto (ou sua categoria) removido desta franquia
    const t = tProducts.find((x) => x.sourceProductId === p.id);
    const categoryId = p.categoryId ? catMap.get(p.categoryId) ?? null : null;
    if (t) {
      await prisma.product.update({
        where: { id: t.id },
        data: { ...pick(p, CONTENT), ...pick(p, INTERNAL), ...(t.priceCustom ? {} : pick(p, PRICE)), categoryId, ...(p.active === false ? { active: false } : {}) },
      }).catch(async (e: any) => {
        if (e?.code !== "P2002") throw e; // código de barras já usado por outro produto da franquia: atualiza sem ele
        await prisma.product.update({ where: { id: t.id }, data: { ...pick(p, CONTENT), ...(t.priceCustom ? {} : pick(p, PRICE)), categoryId } });
      });
      await syncImages(t.id, p.images);
      prodMap.set(p.id, t.id);
      out.products.updated++;
    } else {
      const base = { ...pick(p, CONTENT), ...pick(p, PRICE), active: p.active, unitId: targetUnitId, brandId: target.brandId, categoryId, sourceProductId: p.id };
      const images = { create: p.images.map((i: any) => ({ url: i.url, alt: i.alt, isMain: i.isMain, order: i.order })) };
      const stockItem = { create: { quantity: 0, minQuantity: 5 } }; // estoque é da franquia: começa zerado
      let created: any;
      try {
        created = await prisma.product.create({ data: { ...base, ...pick(p, INTERNAL), sku: p.sku, images, stockItem } as any });
      } catch (e: any) {
        if (e?.code !== "P2002") throw e; // sku/código de barras já existente na franquia: cria sem eles
        created = await prisma.product.create({ data: { ...base, images, stockItem } as any });
      }
      prodMap.set(p.id, created.id);
      out.products.created++;
    }
  }

  // ── combos (só depois dos produtos: precisam mapear os componentes) ──
  const hqCombos: any[] = await prisma.product.findMany({ where: { unitId: hqUnitId, kind: "COMBO" }, include: { images: true, comboItems: true }, omit: { resalePrice: true } });
  const tCombos: any[] = await prisma.product.findMany({ where: { unitId: targetUnitId, kind: "COMBO" }, select: { id: true, sourceProductId: true, priceCustom: true } });
  for (const c of hqCombos) {
    if (isExcluded(c)) continue;
    const items = c.comboItems.map((i: any, idx: number) => ({ productId: prodMap.get(i.productId), maxQty: i.maxQty, order: idx }));
    if (items.some((i: any) => !i.productId)) { out.combos.skipped++; continue; } // componente ainda não existe na franquia
    const categoryId = c.categoryId ? catMap.get(c.categoryId) ?? null : null;
    const t = tCombos.find((x) => x.sourceProductId === c.id);
    if (t) {
      await (prisma as any).$transaction(async (tx: any) => {
        await tx.comboItem.deleteMany({ where: { comboId: t.id } });
        await tx.product.update({
          where: { id: t.id },
          data: { ...pick(c, CONTENT), comboSize: c.comboSize, ...(t.priceCustom ? {} : pick(c, PRICE)), categoryId, ...(c.active === false ? { active: false } : {}), comboItems: { create: items } },
        });
      });
      await syncImages(t.id, c.images);
      out.combos.updated++;
    } else {
      await prisma.product.create({
        data: {
          ...pick(c, CONTENT), ...pick(c, PRICE), kind: "COMBO", comboSize: c.comboSize, active: c.active, unitId: targetUnitId, brandId: target.brandId, categoryId, sourceProductId: c.id,
          images: { create: c.images.map((i: any) => ({ url: i.url, alt: i.alt, isMain: i.isMain, order: i.order })) },
          comboItems: { create: items },
        } as any,
      });
      out.combos.created++;
    }
  }
  return out;
}

// ── Propagação automática: qualquer mudança no catálogo da matriz atualiza as franquias ──
let timer: ReturnType<typeof setTimeout> | null = null;
const pendingHq = new Set<string>();

/** Chamar depois de salvar produto/categoria/combo/foto NA MATRIZ. Agrupa rajadas de edições (2,5 s) numa só propagação. */
export function scheduleCatalogSync(unit: { id: string; type: string; brandId: string }) {
  if (unit.type !== "HQ") return;
  pendingHq.add(`${unit.id}|${unit.brandId}`);
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    const batch = [...pendingHq]; pendingHq.clear(); timer = null;
    for (const key of batch) {
      const [hqId, brandId] = key.split("|");
      try {
        const franchises = await prisma.unit.findMany({ where: { brandId, type: "FRANCHISE", active: true }, select: { id: true } });
        for (const f of franchises) await syncCatalogToUnit(hqId, f.id).catch((e) => console.error(`[catalog-sync] franquia ${f.id}:`, e));
      } catch (e) { console.error("[catalog-sync]", e); }
    }
  }, 2500);
}
