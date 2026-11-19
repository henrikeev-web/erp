/* eslint-disable @typescript-eslint/no-explicit-any -- client Prisma 7 sem tipos (ver CLAUDE.md) */
// Mensagem automática de WhatsApp ao entrar um pedido (loja própria via createOrder + Goomer em tempo real).
//
// Regra: valor dos produtos = total − taxa de entrega (já com desconto). Abaixo de `threshold` ⇒ messageBelow;
// igual ou acima ⇒ messageAbove. `[nome]` vira o primeiro nome do cliente. Configuração por unidade em
// AutoMessageConfig (só a matriz edita, em Configurações). Envio pela Evolution API com o número da loja:
//   EVOLUTION_API_URL (ex.: https://evolution.exemplo.com.br), EVOLUTION_API_KEY, EVOLUTION_INSTANCE.
//
// Não envia: pedido importado (historico), reposição/revenda (priceTier ≠ RETAIL), cliente não varejo,
// pedido cancelado, franquia, pedido com mais de MAX_AGE_MS (evita disparar para pedido antigo que reapareça)
// e telefone inválido. Uma mensagem por pedido: `Order.autoMsgAt` é reivindicado atomicamente antes do envio.
// Tudo é "melhor esforço": nunca atrasa nem derruba o pedido.
import { prisma } from "./prisma";

export const DEFAULT_THRESHOLD = 120;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 20_000;
export const MAX_MESSAGE_LEN = 4000;

const log = (...a: unknown[]) => console.log("[auto-msg]", ...a);
const warn = (...a: unknown[]) => console.warn("[auto-msg]", ...a);

// ── Regras puras (testadas em scripts/test-order-messages.ts) ───────────────

/** Valor considerado: total do pedido sem a taxa de entrega (centavos arredondados). */
export function productsValue(order: { total: number; deliveryFee?: number | null }): number {
  return Math.max(0, Math.round((Number(order.total) - Number(order.deliveryFee ?? 0)) * 100) / 100);
}

export function pickTemplate(cfg: { threshold: number; messageBelow: string; messageAbove: string }, value: number) {
  return value >= cfg.threshold ? { kind: "above" as const, text: cfg.messageAbove } : { kind: "below" as const, text: cfg.messageBelow };
}

/** Primeiro nome com inicial maiúscula ("MARIA silva" → "Maria"). Vazio se não houver nome útil. */
export function firstName(name?: string | null): string {
  const w = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/\p{L}/u.test(w)) return "";
  if (/^(cliente|consumidor|sem)$/i.test(w)) return ""; // "Cliente Goomer" e afins: melhor "Olá!" que "Olá, Cliente!"
  return w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1).toLocaleLowerCase("pt-BR");
}

/** Troca [nome] pelo primeiro nome; sem nome, "Olá, [nome]!" vira "Olá!". */
export function renderMessage(tpl: string, name?: string | null): string {
  const n = firstName(name);
  if (n) return tpl.replace(/\[nome\]/gi, n);
  return tpl.replace(/,\s*\[nome\]/gi, "").replace(/\s*\[nome\]/gi, "");
}

/** Telefone do cliente → número do WhatsApp (55 + DDD + número). null se não parecer celular/fixo brasileiro. */
export function whatsappNumber(phone?: string | null): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (!/^[1-9][1-9]\d{8,9}$/.test(d)) return null;
  return "55" + d;
}

// ── Evolution API ───────────────────────────────────────────────────────────

export function evolutionConfigured() {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);
}

export async function sendWhatsAppText(number: string, text: string): Promise<void> {
  if (!evolutionConfigured()) throw new Error("Evolution API não configurada");
  const base = process.env.EVOLUTION_API_URL!.replace(/\/$/, "");
  const r = await fetch(`${base}/message/sendText/${encodeURIComponent(process.env.EVOLUTION_INSTANCE!)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.EVOLUTION_API_KEY! },
    body: JSON.stringify({ number, text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) {
    const body = (await r.text().catch(() => "")).slice(0, 300);
    throw new Error(`Evolution HTTP ${r.status}${body ? `: ${body}` : ""}`);
  }
}

// ── Configuração ────────────────────────────────────────────────────────────

export const DEFAULT_BELOW = `Olá, [nome]! 💛
Recebemos seu pedido e ele já está sendo preparado com todo carinho!
Mas queremos te contar uma novidade: neste Natal, você pode fazer o bem e ainda ganhar 20% de desconto na sua próxima compra! 🎁

O Banguelas está com a campanha Natal que Acolhe, arrecadando alimentos para levar mais cuidado e carinho a crianças que precisam aqui em Rio Preto.

Funciona assim: em pedidos acima de R$ 120,00, basta doar 1 kg de alimento não perecível para ganhar um voucher de 20% de desconto na próxima compra, sem valor mínimo!
E sabe o que é melhor? Você ainda pode adicionar alguns produtinhos ao seu pedido para atingir o valor da campanha, participar dessa corrente do bem e garantir seu voucher!

Que tal aproveitar e incluir mais alguns itens no seu pedido? 🥰`;

export const DEFAULT_ABOVE = `Olá, [nome]! 💛
Recebemos seu pedido e ele já está sendo preparado com todo carinho!

E temos uma surpresa: você pode fazer o bem neste Natal e ainda ganhar 20% de desconto na sua próxima compra! 🎁
Estamos com a campanha Natal que Acolhe, arrecadando alimentos para ajudar crianças que precisam de cuidado e carinho aqui em Rio Preto.
E como seu pedido passou de R$ 120,00, você já pode participar!

É só doar 1 kg de alimento não perecível na entrega ou retirada do seu pedido. Como agradecimento, você recebe um voucher de 20% para sua próxima compra, sem valor mínimo. Topa fazer parte dessa corrente de carinho? ❤️

É só responder aqui que a gente já organiza tudo!`;

/** Configuração da unidade; cria desligada, com os textos padrão, na primeira leitura. */
export async function getAutoMessageConfig(unitId: string) {
  const db = prisma as any;
  const cur = await db.autoMessageConfig.findUnique({ where: { unitId } });
  if (cur) return cur;
  return db.autoMessageConfig.upsert({
    where: { unitId },
    create: { unitId, enabled: false, threshold: DEFAULT_THRESHOLD, messageBelow: DEFAULT_BELOW, messageAbove: DEFAULT_ABOVE },
    update: {},
  });
}

// ── Envio por pedido ────────────────────────────────────────────────────────

/** Dispara em segundo plano (não espera, não lança). Chamar DEPOIS de a transação do pedido terminar. */
export function scheduleOrderMessage(orderId: string) {
  sendOrderMessage(orderId).catch((e) => warn("erro inesperado, pedido", orderId, e));
}

export async function sendOrderMessage(orderId: string): Promise<string> {
  const db = prisma as any;
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, number: true, unitId: true, status: true, historico: true, priceTier: true, createdAt: true,
      total: true, deliveryFee: true, autoMsgAt: true,
      unit: { select: { type: true } },
      customer: { select: { name: true, phone: true, type: true } },
    },
  });
  if (!order) return "skip:not-found";
  if (order.autoMsgAt) return "skip:already";
  if (order.unit?.type !== "HQ") return "skip:unit";
  if (order.historico || order.status === "CANCELLED" || order.priceTier !== "RETAIL") return "skip:order";
  if (order.customer?.type !== "RETAIL") return "skip:customer";
  if (Date.now() - new Date(order.createdAt).getTime() > MAX_AGE_MS) return "skip:old";

  const cfg = await db.autoMessageConfig.findUnique({ where: { unitId: order.unitId } });
  if (!cfg?.enabled) return "skip:disabled";
  if (!evolutionConfigured()) { warn("ligado, mas EVOLUTION_API_URL/KEY/INSTANCE não definidos"); return "skip:no-evolution"; }

  const number = whatsappNumber(order.customer.phone);
  if (!number) return "skip:phone";

  // Reivindica o envio: só um processo/chamada envia para este pedido.
  const claim = await db.order.updateMany({ where: { id: order.id, autoMsgAt: null }, data: { autoMsgAt: new Date() } });
  if (claim.count === 0) return "skip:already";

  const value = productsValue(order);
  const tpl = pickTemplate(cfg, value);
  const text = renderMessage(tpl.text, order.customer.name);

  let status = "SENT";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await sendWhatsAppText(number, text);
      status = "SENT";
      break;
    } catch (e) {
      status = `FAILED: ${(e as Error).message}`.slice(0, 300);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await db.order.update({ where: { id: order.id }, data: { autoMsgStatus: status } }).catch(() => {});
  if (status === "SENT") log(`pedido ${order.number}: mensagem "${tpl.kind}" enviada (R$ ${value.toFixed(2)})`);
  else warn(`pedido ${order.number}: ${status}`);
  return status === "SENT" ? `sent:${tpl.kind}` : "failed";
}
