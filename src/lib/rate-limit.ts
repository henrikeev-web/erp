import { NextResponse } from "next/server";

/**
 * Limite de tentativas em memória (processo único, como o resto do app: ver SSE e unit cache).
 * Reinicia junto com o servidor; para vários processos, trocar o `store` por Redis.
 */
type Bucket = { count: number; reset: number };
declare global {
  // eslint-disable-next-line no-var
  var __rateLimitStore: Map<string, Bucket> | undefined;
}
const store: Map<string, Bucket> = (global.__rateLimitStore ??= new Map());
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of store) if (b.reset <= now) store.delete(k);
}

export interface LimitResult { ok: boolean; retryAfterSec: number }

/** Conta UMA tentativa e diz se ainda está dentro do limite (limit tentativas por janela). */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  sweep(now);
  const b = store.get(key);
  if (!b || b.reset <= now) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  return b.count > limit ? { ok: false, retryAfterSec: Math.ceil((b.reset - now) / 1000) } : { ok: true, retryAfterSec: 0 };
}

/** Já estourou o limite? (sem contar uma nova tentativa) */
export function isBlocked(key: string, limit: number, now = Date.now()): LimitResult {
  const b = store.get(key);
  return b && b.reset > now && b.count >= limit ? { ok: false, retryAfterSec: Math.ceil((b.reset - now) / 1000) } : { ok: true, retryAfterSec: 0 };
}

/** Registra uma falha (senha errada…). A janela começa na primeira falha. */
export function recordFailure(key: string, windowMs: number, now = Date.now()) {
  const b = store.get(key);
  if (!b || b.reset <= now) store.set(key, { count: 1, reset: now + windowMs });
  else b.count++;
}

export function clearKey(key: string) { store.delete(key); }

type HeaderBag = { get(name: string): string | null } | Record<string, string | string[] | undefined>;
const header = (h: HeaderBag, name: string): string | undefined => {
  if (typeof (h as { get?: unknown }).get === "function") return (h as { get(n: string): string | null }).get(name) ?? undefined;
  const v = (h as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? v.join(",") : v;
};

/**
 * IP do cliente atrás do proxy (Traefik/Coolify). O X-Forwarded-For tem entradas que o PRÓPRIO cliente pode
 * forjar à esquerda; o proxy confiável acrescenta o IP real à direita. Com TRUSTED_PROXY_HOPS (padrão 1)
 * pegamos a entrada que o nosso proxy escreveu. Sem o header (dev local) vira "local".
 */
export function clientIp(h: HeaderBag, hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1)): string {
  const xff = header(h, "x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[Math.max(0, parts.length - hops)].slice(0, 64);
  }
  return (header(h, "x-real-ip") ?? "local").slice(0, 64);
}

/** Resposta 429 padrão. */
export function tooManyRequests(r: LimitResult, message = "Muitas tentativas. Aguarde um pouco e tente de novo.") {
  return NextResponse.json({ error: message }, { status: 429, headers: { "Retry-After": String(Math.max(1, r.retryAfterSec)) } });
}
