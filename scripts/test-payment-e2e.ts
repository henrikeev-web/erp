import { prisma } from "../src/lib/prisma";
import { createOrder, findOrCreateCustomerByPhone, OrderError } from "../src/lib/order-service";
import { confirmOnlinePayment } from "../src/lib/payment-confirm";
import { issuePaymentLink } from "../src/lib/payment-link";

let bad = 0;
const t = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); };

// API da InfinitePay simulada
const calls: { path: string; body: any }[] = [];
let checkReply: any = { success: true, paid: false };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  if (!u.startsWith("https://api.checkout.infinitepay.io")) return realFetch(url, init);
  const path = u.replace("https://api.checkout.infinitepay.io", "");
  const body = JSON.parse(init.body);
  calls.push({ path, body });
  const json = path === "/links" ? { url: "https://checkout.infinitepay.io/fake/abc", slug: "abc" } : checkReply;
  return new Response(JSON.stringify(json), { status: 200 });
}) as any;

(async () => {
  const hq: any = await prisma.unit.findFirst({ where: { type: "HQ" } });
  const prod: any = await prisma.product.findFirst({ where: { unitId: hq.id, active: true, kind: "SIMPLE", stockItem: { quantity: { gt: 40 } } }, include: { stockItem: true } });
  const zone: any = await prisma.deliveryZone.findFirst({ where: { unitId: hq.id, active: true } });
  const cust = await findOrCreateCustomerByPhone(hq, { phone: "17999990001", name: "Teste Pagto" });
  const mk = (method: string) => createOrder({ unit: hq, customerId: cust.id, type: "DELIVERY", deliveryZoneId: zone?.id, paymentMethod: method, items: [{ productId: prod.id, quantity: 4 }], source: "STOREFRONT" });

  await prisma.unit.update({ where: { id: hq.id }, data: { infinitepayHandle: null } });
  // 1. unidade sem handle: online recusado
  delete process.env.INFINITEPAY_HANDLE;
  let err: any; try { await mk("ONLINE_PIX"); } catch (e) { err = e; }
  t("sem handle: pedido online recusado", err instanceof OrderError, true);
  t("sem handle: nenhuma chamada ao gateway", calls.length, 0);

  // 2. com handle: cria link
  await prisma.unit.update({ where: { id: hq.id }, data: { infinitepayHandle: "banguelas" } });
  const order: any = await mk("ONLINE_PIX");
  t("com handle: link gerado", order.paymentLinkUrl, "https://checkout.infinitepay.io/fake/abc");
  t("com handle: sem falha de link", order.paymentLinkFailed, false);
  const link = calls.find((c) => c.path === "/links")!.body;
  t("link: handle da unidade", link.handle, "banguelas");
  t("link: order_nsu = id do pedido", link.order_nsu, order.id);
  t("link: soma dos itens = total do pedido (frete incluso)", link.items.reduce((s: number, i: any) => s + i.price * i.quantity, 0), Math.round(order.total * 100));
  t("link: webhook", link.webhook_url.endsWith("/api/pagamentos/webhook"), true);
  t("link: redirect", link.redirect_url.endsWith("/pedido/retorno"), true);
  t("pagamento nasce PROCESSING", order.payment.status, "PROCESSING");

  const total = Math.round(order.total * 100);
  const confirm = (o = order.id, tx = "tx1") => confirmOnlinePayment({ orderId: o, transactionNsu: tx, slug: "abc" });

  // 3. webhook falso (não pago na InfinitePay)
  checkReply = { success: true, paid: false };
  t("webhook falso: NOT_PAID", await confirm(), "NOT_PAID");
  t("webhook falso: pedido segue PENDING", (await prisma.order.findUnique({ where: { id: order.id } }) as any).status, "PENDING");

  // 4. pago a menos
  checkReply = { success: true, paid: true, amount: total, paid_amount: total - 1 };
  t("pago a menos: NOT_PAID", await confirm(), "NOT_PAID");

  // 5. pago de verdade (com juros)
  checkReply = { success: true, paid: true, amount: total, paid_amount: total + 150, installments: 3, capture_method: "credit_card" };
  t("pago: PAID", await confirm(), "PAID");
  const after: any = await prisma.order.findUnique({ where: { id: order.id }, include: { payment: true } });
  t("pedido CONFIRMED", after.status, "CONFIRMED");
  t("payment PAID", after.payment.status, "PAID");
  t("gateway guarda transação verificada", after.payment.gatewayId, "tx1");
  t("payment_check usou o handle da unidade e o order_nsu", calls.filter((c) => c.path === "/payment_check").at(-1)!.body, { handle: "banguelas", order_nsu: order.id, transaction_nsu: "tx1", slug: "abc" });

  // 6. repetição (webhook + redirect)
  t("repetido: ALREADY_PAID", await confirm(), "ALREADY_PAID");
  const [a, b] = await Promise.all([confirm(), confirm()]);
  t("concorrente: nunca PAID de novo", [a, b].includes("PAID" as any), false);

  // 7. pedido inexistente / de outra unidade
  t("pedido inexistente: NOT_FOUND", await confirm("naoexiste"), "NOT_FOUND");
  const outra: any = await prisma.unit.create({ data: { brandId: hq.brandId, type: "FRANCHISE", name: "Outra", slug: "outra-teste", infinitepayHandle: "outra" } });
  t("unitId diferente: NOT_FOUND", await confirmOnlinePayment({ orderId: order.id, unitId: outra.id, transactionNsu: "tx1", slug: "abc" }), "NOT_FOUND");

  // 8. pedido cancelado antes de pagar
  const o2: any = await mk("ONLINE_CREDIT");
  await prisma.order.update({ where: { id: o2.id }, data: { status: "CANCELLED" } });
  checkReply = { success: true, paid: true, amount: Math.round(o2.total * 100), paid_amount: Math.round(o2.total * 100) };
  t("cancelado: ORDER_CANCELLED e não confirma", await confirm(o2.id, "tx2"), "ORDER_CANCELLED");
  t("cancelado: link não é gerado de novo", await issuePaymentLink(o2.id, hq.id).then(() => "ok", (e) => e.message), "Pedido cancelado");

  // 9. pedido pago não gera novo link
  t("pago: não reemite link", await issuePaymentLink(order.id, hq.id).then(() => "ok", (e) => e.message), "Pedido já pago");

  // 10. gateway fora do ar: pedido existe, link falha, cliente é avisado
  globalThis.fetch = (async (url: any, init: any) => String(url).startsWith("https://api.checkout") ? new Response("boom", { status: 500 }) : realFetch(url, init)) as any;
  const o3: any = await mk("ONLINE_PIX");
  t("gateway 500: pedido criado sem link", [!!o3.id, o3.paymentLinkUrl ?? null, o3.paymentLinkFailed], [true, null, true]);

  await prisma.unit.delete({ where: { id: outra.id } });
  console.log(bad ? `\n${bad} FALHA(S)` : "\ntudo ok");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
