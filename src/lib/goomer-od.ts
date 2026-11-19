// Integração Goomer → ERP em tempo real pela API Open Delivery (somente leitura).
//
// O Goomer continua sendo onde a loja opera os pedidos (aceitar, despachar). O ERP só ACOMPANHA:
// - consulta GET /v1/events:polling a cada GOOMER_OD_POLL_SECONDS (padrão 30 s, mín. 15; HTTP 429 ⇒ pausa);
// - para CREATED busca o pedido (GET /v1/orders/{id}) e grava no ERP já como ENTREGUE
//   (source='goomer', externalId=id Open Delivery), sem estoque, fidelidade nem impressão (só a mensagem automática de
//   src/lib/order-messages.ts, se ligada);
// - CANCELLED marca o pedido como cancelado; os demais eventos só são registrados no log;
// - só DEPOIS de gravar confirma o evento (POST /v1/events/acknowledgment). Erro ⇒ não confirma e o
//   evento volta na próxima consulta. NUNCA chama confirm/dispatch/cancel do pedido.
//
// Observado em 2026-11-19: o Goomer só emite CREATED (aceite no gestor não gera evento) e só entrega
// pedidos criados depois que a credencial foi gerada. Variáveis: GOOMER_OD_CLIENT_ID, GOOMER_OD_CLIENT_SECRET,
// opcionais GOOMER_OD_BASE_URL, GOOMER_OD_UNIT_SLUG (padrão matriz), GOOMER_OD_MERCHANT_ID,
// GOOMER_OD_POLL_SECONDS, GOOMER_OD_ACK=0 (teste: não confirma eventos). O serviço só liga com
// GOOMER_OD_ENABLED=1, que existe SÓ no Coolify (produção).
import { prisma } from "./prisma";
import { emitAdminEvent } from "./sse";
import { scheduleOrderMessage } from "./order-messages";
import { mapOrder, normName, stripMarks, type OdOrder } from "./goomer-od-map";

const SOURCE = "goomer";
const BASE = () => (process.env.GOOMER_OD_BASE_URL || "https://partner-api.goomer.app/opendelivery").replace(/\/$/, "");
const TIMEOUT_MS = 15_000;

export type OdEvent = { eventId: string; eventType: string; orderId: string; createdAt?: string };

export function goomerOdConfigured() {
  return !!(process.env.GOOMER_OD_CLIENT_ID && process.env.GOOMER_OD_CLIENT_SECRET);
}

/** O serviço só liga com GOOMER_OD_ENABLED=1 (definido só na produção): um servidor local que carregue o
 *  .env com a credencial não pode confirmar eventos e "roubar" pedidos do app de produção. */
export function goomerOdEnabled() {
  return goomerOdConfigured() && process.env.GOOMER_OD_ENABLED === "1";
}

const log = (...a: unknown[]) => console.log("[goomer-od]", ...a);
const warn = (...a: unknown[]) => console.warn("[goomer-od]", ...a);

// ── Cliente HTTP ────────────────────────────────────────────────────────────
export class RateLimitError extends Error {
  constructor(message: string, public waitSeconds: number) { super(message); }
}

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const r = await fetch(`${BASE()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.GOOMER_OD_CLIENT_ID!,
      client_secret: process.env.GOOMER_OD_CLIENT_SECRET!,
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token) throw new Error(`token: HTTP ${r.status}`);
  const ttl = Math.max(60, Number(j.expires_in) || 3600);
  token = { value: j.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
  return token.value;
}

async function api(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await fetch(`${BASE()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.status === 401 && tentativa === 0) { token = null; continue; } // token expirado: renova uma vez
    const text = await r.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    if (r.status === 429) {
      // Limite de chamadas do Goomer: respeita o Retry-After (segundos) ou espera 60 s.
      const wait = Math.min(600, Math.max(10, Number(r.headers.get("retry-after")) || 60));
      throw new RateLimitError(`${method} ${path}: HTTP 429 (limite do Goomer), pausa de ${wait}s`, wait);
    }
    if (r.status >= 400) throw new Error(`${method} ${path}: HTTP ${r.status}`);
    return { status: r.status, json };
  }
  throw new Error(`${method} ${path}: não autorizado`);
}

export async function pollEvents(): Promise<OdEvent[]> {
  const { status, json } = await api("GET", "/v1/events:polling");
  if (status === 204 || !Array.isArray(json)) return [];
  return (json as OdEvent[]).filter((e) => e && e.eventId && e.orderId);
}

export async function fetchOrder(orderId: string): Promise<OdOrder> {
  const { json } = await api("GET", `/v1/orders/${encodeURIComponent(orderId)}`);
  return json as OdOrder;
}

export async function acknowledge(events: OdEvent[]) {
  if (!events.length) return;
  await api("POST", "/v1/events/acknowledgment", events.map((e) => ({ id: e.eventId, orderId: e.orderId, eventType: e.eventType })));
}

// ── Gravação no ERP ─────────────────────────────────────────────────────────
async function getUnit() {
  const slug = process.env.GOOMER_OD_UNIT_SLUG || "matriz";
  const unit = await prisma.unit.findFirst({ where: { slug }, select: { id: true, brandId: true } });
  if (!unit) throw new Error(`unidade "${slug}" não encontrada`);
  return unit;
}

/** Grava (se ainda não existir) o pedido do Goomer na unidade. Idempotente por (unitId, source, externalId). */
export async function ingestOrder(od: OdOrder): Promise<{ created: boolean; orderId: string; number: number }> {
  const merchant = process.env.GOOMER_OD_MERCHANT_ID;
  if (merchant && od.merchant?.id && String(od.merchant.id) !== merchant)
    throw new Error(`pedido ${od.id} é da loja ${od.merchant.id}, esperado ${merchant}`);
  const m = mapOrder(od);
  const unit = await getUnit();

  const existing = await prisma.order.findFirst({
    where: { unitId: unit.id, source: SOURCE, externalId: m.externalId },
    select: { id: true, number: true },
  });
  if (existing) return { created: false, orderId: existing.id, number: existing.number };

  // Produtos da unidade por nome normalizado (mesma regra do importador); sem par ⇒ "Legado Goomer".
  const products = await prisma.product.findMany({ where: { unitId: unit.id }, select: { id: true, name: true, active: true } });
  const byName = new Map<string, string>();
  for (const p of products.sort((a, b) => Number(a.active) - Number(b.active))) byName.set(normName(p.name), p.id); // ativo prevalece

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- client Prisma 7 sem tipos (ver CLAUDE.md)
  const result = await prisma.$transaction(async (tx: any) => {
    // Mesmo lock do createOrder: alocação do número em série dentro da unidade.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"order-number:" + unit.id}))`;
    const again = await tx.order.findFirst({ where: { unitId: unit.id, source: SOURCE, externalId: m.externalId }, select: { id: true, number: true } });
    if (again) return { created: false, orderId: again.id, number: again.number, customerName: "" };

    let legadoId: string | null = null;
    const productFor = async (name: string) => {
      const n = normName(name);
      const hit = byName.get(n) ?? byName.get(stripMarks(n));
      if (hit) return hit;
      if (!legadoId) {
        const leg = await tx.product.findFirst({ where: { unitId: unit.id, name: "Legado Goomer" }, select: { id: true } });
        legadoId = leg?.id ?? (await tx.product.create({
          data: {
            brandId: unit.brandId, unitId: unit.id, name: "Legado Goomer", price: 0, active: false, frozen: false,
            description: "Itens de pedidos do Goomer sem equivalente no cardápio atual",
          },
          select: { id: true },
        })).id;
      }
      return legadoId!;
    };

    // Cliente: por telefone na unidade; existente não é alterado (só lastOrderAt).
    const phone = m.phone || `goomer:${m.externalId}`.slice(0, 40);
    let customer = await tx.customer.findFirst({ where: { unitId: unit.id, phone }, select: { id: true, name: true, lastOrderAt: true } });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          brandId: unit.brandId, unitId: unit.id, name: m.customerName, email: m.customerEmail, phone,
          type: "RETAIL", source: SOURCE, externalId: phone, createdAt: m.createdAt, lastOrderAt: m.createdAt,
          notifWhatsapp: false, notifEmail: false, notifPromos: false, notifReorder: false,
        },
        select: { id: true, name: true, lastOrderAt: true },
      });
    } else if (!customer.lastOrderAt || customer.lastOrderAt < m.createdAt) {
      await tx.customer.update({ where: { id: customer.id }, data: { lastOrderAt: m.createdAt } });
    }

    let addressId: string | null = null;
    if (m.address) {
      const a = m.address;
      const same = await tx.customerAddress.findFirst({
        where: { customerId: customer.id, cep: a.cep, street: a.street, number: a.number, complement: a.complement ?? null },
        select: { id: true },
      });
      addressId = same?.id ?? (await tx.customerAddress.create({ data: { customerId: customer.id, label: "Casa", ...a }, select: { id: true } })).id;
    }

    // Número: continua a sequência negativa do Goomer (exibida como 0.N), sem tocar na numeração da loja própria.
    const lowest = await tx.order.findFirst({ where: { unitId: unit.id }, orderBy: { number: "asc" }, select: { number: true } });
    const number = Math.min(lowest?.number ?? 0, 0) - 1;

    const items: { productId: string; name: string; price: number; quantity: number; total: number; notes?: string }[] = [];
    for (const i of m.items) items.push({ productId: await productFor(i.name), name: i.name, price: i.price, quantity: i.quantity, total: i.total, notes: i.notes });

    const order = await tx.order.create({
      data: {
        number, brandId: unit.brandId, unitId: unit.id, customerId: customer.id, addressId,
        type: m.type, status: "DELIVERED", notes: m.notes,
        subtotal: m.subtotal, deliveryFee: m.deliveryFee, discount: m.discount, total: m.total,
        confirmedAt: m.createdAt, deliveredAt: m.createdAt, createdAt: m.createdAt,
        source: SOURCE, externalId: m.externalId, historico: false,
        items: { create: items },
        payment: {
          create: {
            method: m.payment.method, status: "PAID", amount: m.total, paidAt: m.createdAt, createdAt: m.createdAt,
            changeAmount: m.payment.changeFor,
            gatewayData: { origem: "goomer-opendelivery", prepago: m.payment.prepaid, bandeira: m.payment.brand ?? null },
          },
        },
      },
      select: { id: true, number: true },
    });
    return { created: true, orderId: order.id, number: order.number, customerName: customer.name, unitId: unit.id };
  });

  if (result.created) {
    // Evento próprio: o painel atualiza a lista; o print-agent ignora (só imprime order_new/order_confirmed).
    emitAdminEvent({ unitId: unit.id, type: "order_external", orderId: result.orderId, orderNumber: result.number, customerName: result.customerName });
    // Mensagem automática de WhatsApp (ver src/lib/order-messages.ts): só pedido novo, nunca reenvio.
    scheduleOrderMessage(result.orderId);
  }
  return { created: result.created, orderId: result.orderId, number: result.number };
}

async function alreadyStored(externalId: string) {
  const unit = await getUnit();
  return !!(await prisma.order.findFirst({ where: { unitId: unit.id, source: SOURCE, externalId }, select: { id: true } }));
}

export async function cancelOrder(externalId: string) {
  const unit = await getUnit();
  const order = await prisma.order.findFirst({ where: { unitId: unit.id, source: SOURCE, externalId }, select: { id: true, number: true, status: true } });
  if (!order) return false; // pedido anterior à integração: nada a fazer
  if (order.status === "CANCELLED") return true;
  const now = new Date();
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: now, deliveredAt: null, cancelReason: "Cancelado no Goomer" } }),
    prisma.payment.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } }),
  ]);
  emitAdminEvent({ unitId: unit.id, type: "order_external", orderId: order.id, orderNumber: order.number, status: "CANCELLED" });
  return true;
}

// ── Ciclo de consulta ───────────────────────────────────────────────────────
/** Uma rodada: lê os eventos, grava e confirma só o que foi processado. Devolve um resumo. */
export async function syncOnce(opts: { ack?: boolean } = {}) {
  const ack = opts.ack ?? process.env.GOOMER_OD_ACK !== "0";
  const events = await pollEvents();
  const done: OdEvent[] = [];
  const resumo = { eventos: events.length, novos: 0, cancelados: 0, ignorados: 0, erros: 0, confirmados: 0 };
  for (const e of events) {
    try {
      const type = String(e.eventType).toUpperCase();
      if (type === "CREATED") {
        if (!(await alreadyStored(e.orderId))) {
          const r = await ingestOrder(await fetchOrder(e.orderId));
          if (r.created) { resumo.novos++; log(`pedido ${e.orderId} gravado como 0.${-r.number}`); }
        }
      } else if (type === "CANCELLED") {
        // Se o pedido ainda não estiver no ERP, grava antes de cancelar (evento CREATED perdido).
        if (!(await alreadyStored(e.orderId))) {
          const r = await ingestOrder(await fetchOrder(e.orderId)).catch((err) => {
            if (err instanceof RateLimitError) throw err;
            return null;
          });
          if (r?.created) resumo.novos++;
        }
        await cancelOrder(e.orderId);
        resumo.cancelados++;
        log(`pedido ${e.orderId} cancelado no Goomer`);
      } else {
        resumo.ignorados++;
        log(`evento ${type} do pedido ${e.orderId} registrado (sem ação)`);
      }
      done.push(e);
    } catch (err) {
      if (err instanceof RateLimitError) throw err; // para a rodada; o que já foi gravado é confirmado na próxima
      resumo.erros++;
      warn(`evento ${e.eventType} ${e.orderId} falhou (fica para a próxima consulta):`, err instanceof Error ? err.message : err);
    }
  }
  if (ack && done.length) {
    await acknowledge(done);
    resumo.confirmados = done.length;
  }
  return resumo;
}

declare global {
  var __goomerOdPoller: NodeJS.Timeout | undefined;
}

/** Liga o serviço (uma vez por processo). Sem credenciais, não faz nada. */
export function startGoomerOdPoller() {
  if (!goomerOdEnabled() || global.__goomerOdPoller) return;
  const seconds = Math.min(300, Math.max(15, Number(process.env.GOOMER_OD_POLL_SECONDS) || 30));
  let running = false;
  let falhas = 0;
  let pausedUntil = 0;
  const tick = async () => {
    if (running || Date.now() < pausedUntil) return;
    running = true;
    try {
      const r = await syncOnce();
      if (falhas) log("consulta voltou a funcionar");
      falhas = 0;
      if (r.eventos) log(JSON.stringify(r));
    } catch (err) {
      if (err instanceof RateLimitError) {
        pausedUntil = Date.now() + err.waitSeconds * 1000;
        warn(err.message);
        return;
      }
      falhas++;
      // Loga a 1ª falha e depois a cada ~10 min, para não inundar o log se o Goomer cair.
      if (falhas === 1 || falhas % Math.ceil(600 / seconds) === 0)
        warn(`consulta falhou (${falhas}x seguidas):`, err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  global.__goomerOdPoller = setInterval(tick, seconds * 1000);
  setTimeout(tick, 5_000);
  log(`serviço ligado: consulta a cada ${seconds}s na unidade ${process.env.GOOMER_OD_UNIT_SLUG || "matriz"}`);
}
