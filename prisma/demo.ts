/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dados de DEMONSTRAÇÃO para navegar por todas as funcionalidades novas. Roda DEPOIS do seed:
 *   DATABASE_URL=postgresql://…/erp_demo npx tsx prisma/demo.ts
 * Idempotente. RECUSA rodar fora de um banco local de teste (nunca contra produção).
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { createOrder, restoreOrderStock } from "../src/lib/order-service";
import { createFranchise } from "../src/lib/franchise";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/(demo|dev|test)/i.test(url.split("/").pop() ?? "")) {
  console.error("Recusado: o demo só roda em banco LOCAL cujo nome contenha demo/dev/test. URL:", url.replace(/:[^:@]+@/, ":***@"));
  process.exit(1);
}

const PASS = "demo1234";
const db: any = prisma;
const r2 = (n: number) => Math.round(n * 100) / 100;

function ean13(base12: string) {
  const d = base12.split("").map(Number);
  const s = d.reduce((a, x, i) => a + x * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + String((10 - (s % 10)) % 10);
}

async function main() {
  const hq = await db.unit.findUnique({ where: { slug: "matriz" } });
  if (!hq) throw new Error("Rode o seed antes (npx tsx prisma/seed.ts)");
  const hash = await bcrypt.hash(PASS, 10);

  // ── usuários ──────────────────────────────────────────────────────────────
  await db.user.upsert({ where: { email: "atendente@banguelas.com.br" }, update: {}, create: { name: "Atendente Demo", email: "atendente@banguelas.com.br", passwordHash: hash, role: "STAFF", unitId: hq.id } });
  await db.user.update({ where: { email: "admin@banguelas.com.br" }, data: { passwordHash: await bcrypt.hash("admin123", 10) } });

  // ── produtos: preço de revenda (sigiloso), dados internos, estoque ─────────
  const products: any[] = await db.product.findMany({ where: { unitId: hq.id, kind: "SIMPLE" }, orderBy: { name: "asc" } });
  for (const [i, p] of products.entries()) {
    await db.product.update({
      where: { id: p.id },
      data: {
        resalePrice: r2(p.price * 0.7),
        barcode: ean13(`78912345${String(i).padStart(4, "0")}`), ncm: "19023000",
        packWeightG: 300 + i * 20, packLengthCm: 14, packWidthCm: 10, packHeightCm: 5,
      },
    });
    await db.stockItem.updateMany({ where: { productId: p.id }, data: { quantity: 80 } });
  }

  // ── zonas de entrega com custo do entregador ──────────────────────────────
  await db.deliveryZone.updateMany({ where: { unitId: hq.id }, data: { courierFee: 6 } });
  await db.deliveryZone.upsert({
    where: { id: "zone-demo-norte" }, update: {},
    create: { id: "zone-demo-norte", unitId: hq.id, name: "Zona Norte", neighborhoods: ["Vila Norte"], cities: [], fee: 12, courierFee: 9, minOrder: 30, freeAbove: 120 },
  });
  const zone = await db.deliveryZone.findFirst({ where: { unitId: hq.id, id: { not: "zone-demo-norte" } } });
  const zoneN = await db.deliveryZone.findUnique({ where: { id: "zone-demo-norte" } });

  // ── entregadores ──────────────────────────────────────────────────────────
  const courier = async (name: string, phone: string, pixKey: string) =>
    (await db.courier.findFirst({ where: { unitId: hq.id, phone } })) ?? db.courier.create({ data: { unitId: hq.id, name, phone, pixKey } });
  const joao = await courier("João Motoboy", "17988881111", "joao@pix.com");
  const maria = await courier("Maria Rápida", "17988882222", "17988882222");

  // ── clientes: revendedor, franqueado virá depois, cliente com login ───────
  const retail = (await db.customer.findFirst({ where: { unitId: hq.id, phone: "17900000001" } })) ?? await db.customer.create({ data: { unitId: hq.id, brandId: hq.brandId, name: "Cliente Demo", phone: "17900000001", email: "cliente@demo.com", passwordHash: hash } });
  await db.loyaltyCard.upsert({ where: { customerId: retail.id }, update: {}, create: { customerId: retail.id } });
  let reseller = await db.customer.findFirst({ where: { unitId: hq.id, phone: "17977770001" } });
  if (!reseller) {
    reseller = await db.customer.create({ data: { unitId: hq.id, brandId: hq.brandId, name: "Mercadinho Sol (revendedor)", phone: "17977770001", email: "revendedor@demo.com", cpf: "45723174000110", type: "RESELLER", passwordHash: hash } });
    await db.loyaltyCard.create({ data: { customerId: reseller.id } });
  }
  const addr = (await db.customerAddress.findFirst({ where: { customerId: retail.id } })) ?? await db.customerAddress.create({ data: { customerId: retail.id, label: "Casa", cep: "15000000", street: "Rua das Flores", number: "100", neighborhood: "Centro", city: "São José do Rio Preto", state: "SP", deliveryZoneId: zone.id, isDefault: true } });

  // ── combo de 20 (peixe/carne limitado a 3) ────────────────────────────────
  if (!(await db.product.findFirst({ where: { unitId: hq.id, kind: "COMBO" } })) && products.length >= 4) {
    await db.product.create({
      data: {
        unitId: hq.id, brandId: hq.brandId, kind: "COMBO", comboSize: 20, name: "Combo 20 Marmitas", description: "Monte o seu combo com 20 marmitas. A de carne é limitada a 3 por combo.",
        price: 199.9, frozen: true, featured: true, categoryId: products[0].categoryId,
        comboItems: { create: products.slice(0, 4).map((p, i) => ({ productId: p.id, maxQty: i === 2 ? 3 : null, order: i })) },
      },
    });
  }
  const combo = await db.product.findFirst({ where: { unitId: hq.id, kind: "COMBO" }, include: { comboItems: true } });

  // ── financeiro ─────────────────────────────────────────────────────────────
  const cc = async (name: string) => (await db.costCenter.findFirst({ where: { unitId: hq.id, name } })) ?? db.costCenter.create({ data: { unitId: hq.id, name } });
  const ccAluguel = await cc("Aluguel"); const ccSal = await cc("Salários"); const ccMkt = await cc("Marketing");
  const fornecedor = (await db.supplier.findFirst({ where: { unitId: hq.id, name: "Distribuidora Alfa" } })) ?? await db.supplier.create({ data: { unitId: hq.id, name: "Distribuidora Alfa", document: "11222333000181", email: "contato@alfa.com" } });
  const today = new Date(); const d = (off: number) => new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + off));
  if (!(await db.recurringEntry.findFirst({ where: { unitId: hq.id, description: "Aluguel do galpão" } }))) {
    await db.recurringEntry.create({ data: { unitId: hq.id, type: "PAYABLE", description: "Aluguel do galpão", amount: 3500, every: 1, period: "MONTH", startDate: new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 5)), costCenterId: ccAluguel.id } });
    await db.recurringEntry.create({ data: { unitId: hq.id, type: "PAYABLE", description: "Limpeza semanal", amount: 180, every: 1, period: "WEEK", startDate: d(-14), costCenterId: ccSal.id } });
    await db.financialEntry.createMany({ data: [
      { unitId: hq.id, type: "PAYABLE", description: "Compra de embalagens", amount: 640, dueDate: d(-3), supplierId: fornecedor.id, costCenterId: ccMkt.id },
      { unitId: hq.id, type: "PAYABLE", description: "Compra de insumos (parcela 1/3)", amount: 420, dueDate: d(6), supplierId: fornecedor.id, installmentNumber: 1, installmentTotal: 3 },
      { unitId: hq.id, type: "RECEIVABLE", description: "Aluguel de espaço na câmara fria", amount: 900, dueDate: d(10) },
    ] });
  }

  // ── pedidos (entregues em dias anteriores p/ o relatório de entregadores) ─
  if ((await db.order.count({ where: { unitId: hq.id, courierId: { not: null } } })) === 0) {
    const item = (p: any, q: number) => ({ productId: p.id, quantity: q });
    const mk = async (customerId: string, courierId: string, z: any, daysAgo: number, hour: number) => {
      const o = await createOrder({
        unit: hq, customerId, type: "DELIVERY", addressId: addr.id, deliveryZoneId: z.id, paymentMethod: "PIX",
        items: [item(products[0], 2), item(products[1], 3)], source: "ADMIN", pricing: "BY_CUSTOMER", initialStatus: "IN_PRODUCTION", courierId, markPaid: true,
      });
      const at = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, hour + 3, 0, 0)); // hora de Brasília → UTC
      await db.order.update({ where: { id: o.id }, data: { status: "DELIVERED", deliveredAt: at, dispatchedAt: at, readyAt: at, createdAt: at } });
    };
    for (const [c, z, dago, h] of [[joao, zone, 3, 10], [joao, zone, 3, 14], [maria, zoneN, 3, 18], [joao, zone, 2, 11], [maria, zone, 2, 13], [maria, zoneN, 2, 19], [joao, zoneN, 1, 12], [maria, zone, 1, 16]] as any[]) await mk(retail.id, c.id, z, dago, h);

    // pedido cancelado (estoque devolvido)
    const oc = await createOrder({ unit: hq, customerId: retail.id, type: "PICKUP", paymentMethod: "PIX", items: [item(products[2], 4)], source: "ADMIN", initialStatus: "IN_PRODUCTION" });
    await db.$transaction(async (tx: any) => {
      await tx.order.update({ where: { id: oc.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Cliente desistiu" } });
      await restoreOrderStock(tx, oc.id, hq.id);
    });

    // revendedor: pedido faturado em 14 dias (gera conta a receber) + combo
    await createOrder({ unit: hq, customerId: reseller.id, type: "PICKUP", paymentMethod: "INVOICE", invoiceDays: 14, items: [item(products[0], 20), item(products[1], 15)], source: "ADMIN", pricing: "BY_CUSTOMER", initialStatus: "IN_PRODUCTION" });
    if (combo) {
      const ci = combo.comboItems;
      await createOrder({ unit: hq, customerId: retail.id, type: "PICKUP", paymentMethod: "PIX", source: "ADMIN", initialStatus: "IN_PRODUCTION", items: [{ productId: combo.id, quantity: 1, combo: [{ productId: ci[0].productId, quantity: 8 }, { productId: ci[1].productId, quantity: 6 }, { productId: ci[2].productId, quantity: 3 }, { productId: ci[3].productId, quantity: 3 }] }] });
    }
    // pedido manual com desconto de 10% (entrada em produção)
    await createOrder({ unit: hq, customerId: retail.id, type: "DELIVERY", addressId: addr.id, deliveryZoneId: zone.id, paymentMethod: "CASH", items: [item(products[3], 6)], source: "ADMIN", pricing: "BY_CUSTOMER", initialStatus: "IN_PRODUCTION", courierId: joao.id, manualDiscount: { type: "PERCENT", amount: 10, note: "cliente antigo" } });
  }

  // ── franquia de exemplo (link + usuários + catálogo) ──────────────────────
  let fr = await db.unit.findUnique({ where: { slug: "ribeirao" } });
  if (!fr) {
    await createFranchise(hq, {
      name: "Banguelas Ribeirão Preto", slug: "ribeirao", city: "Ribeirão Preto", state: "SP",
      franchisee: { name: "Carlos Franqueado", phone: "16999990001", email: "carlos@ribeirao.demo", document: undefined },
      users: [{ name: "Ana Gerente", email: "ana@ribeirao.demo", role: "ADMIN" }, { name: "Bruno Atendente", email: "bruno@ribeirao.demo", role: "STAFF" }],
      copyCatalog: true,
    } as any);
    fr = await db.unit.findUnique({ where: { slug: "ribeirao" } });
  }
  // senha conhecida p/ a demonstração + estoque da franquia + um pedido
  await db.user.updateMany({ where: { unitId: fr.id }, data: { passwordHash: hash } });
  const frProducts: any[] = await db.product.findMany({ where: { unitId: fr.id, kind: "SIMPLE" } });
  for (const p of frProducts) await db.stockItem.updateMany({ where: { productId: p.id }, data: { quantity: 40 } });
  if ((await db.order.count({ where: { unitId: fr.id } })) === 0 && frProducts.length) {
    const c = await db.customer.create({ data: { unitId: fr.id, brandId: hq.brandId, name: "Cliente Ribeirão", phone: "16988880001" } });
    await db.loyaltyCard.create({ data: { customerId: c.id } });
    await createOrder({ unit: fr, customerId: c.id, type: "PICKUP", paymentMethod: "PIX", items: [{ productId: frProducts[0].id, quantity: 3 }], source: "ADMIN", initialStatus: "IN_PRODUCTION" });
  }

  console.log(`
════════════ AMBIENTE DE DEMONSTRAÇÃO PRONTO ════════════
Matriz (http://localhost:3000)
  admin ............ admin@banguelas.com.br        / admin123
  atendente ........ atendente@banguelas.com.br    / ${PASS}     (vê menos: sem financeiro, entregadores e franquias)
  cliente comum .... cliente@demo.com              / ${PASS}     (Minha Conta)
  revendedor ....... revendedor@demo.com           / ${PASS}     (vê preço de revenda e pode faturar)
Franquia Ribeirão Preto (http://ribeirao.localhost:3000)
  administrador .... ana@ribeirao.demo             / ${PASS}
  atendente ........ bruno@ribeirao.demo           / ${PASS}
`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
