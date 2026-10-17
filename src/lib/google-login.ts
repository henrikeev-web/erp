import { HQ_SLUG, isValidSlug } from "./unit-host";

// Cookie (host de autenticação) que lembra em QUAL unidade o cliente está entrando.
// O callback do Google sempre cai no AUTH_HOST, então a unidade de origem precisa viajar de algum jeito.
export const LOGIN_COOKIE = "bg_login";
export const LOGIN_COOKIE_MAX_AGE = 600; // 10 min

export interface LoginIntent {
  unit: string;
  returnTo: string; // sempre um caminho ("/minha-conta"), nunca URL absoluta
}

/** Só caminhos internos: bloqueia "//evil.com", "https://…" e "/\evil". */
export function safeReturnPath(p: string | null | undefined, fallback = "/minha-conta"): string {
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\") || p.includes("://")) return fallback;
  return p;
}

export function parseLoginCookie(raw: string | undefined): LoginIntent {
  try {
    // O Next já decodifica o valor do cookie; aceita também a forma ainda codificada
    const text = raw ?? "";
    const v = JSON.parse(text.trimStart().startsWith("{") ? text : decodeURIComponent(text));
    return {
      unit: typeof v.unit === "string" && isValidSlug(v.unit) ? v.unit : HQ_SLUG,
      returnTo: safeReturnPath(v.returnTo),
    };
  } catch {
    return { unit: HQ_SLUG, returnTo: "/minha-conta" };
  }
}

type HeaderBag = { get(name: string): string | null };

const first = (v: string | null) => (v ?? "").split(",")[0].trim().toLowerCase();
const isLocalHost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");

/**
 * Origem PÚBLICA da requisição atrás do proxy. `req.url`/`req.nextUrl.origin` NÃO servem: com o servidor ouvindo em
 * 0.0.0.0 (Docker) o Next devolve sempre "localhost:<porta>", ignorando o Host. Em produção (BASE_DOMAIN + AUTH_HOST)
 * só aceita o AUTH_HOST ou subdomínios de BASE_DOMAIN (Host forjado cai no AUTH_HOST); em dev só localhost.
 */
export function publicOrigin(headers: HeaderBag, fallbackOrigin: string): string {
  const base = process.env.BASE_DOMAIN?.toLowerCase();
  const authHost = process.env.AUTH_HOST?.toLowerCase();
  const host = first(headers.get("x-forwarded-host")) || first(headers.get("host"));
  const hostname = host.split(":")[0];

  if (base && authHost) {
    const mine = hostname === authHost || hostname === base || hostname.endsWith(`.${base}`);
    return `https://${mine && host ? host : authHost}`;
  }
  if (host && isLocalHost(hostname)) {
    const proto = first(headers.get("x-forwarded-proto")) === "https" ? "https" : "http";
    return `${proto}://${host}`;
  }
  return fallbackOrigin;
}

/** Origem pública de uma unidade. Em dev (host fora de BASE_DOMAIN) volta a própria origem da request. */
export function originForUnit(slug: string, requestOrigin: string): string {
  const base = process.env.BASE_DOMAIN;
  const authHost = process.env.AUTH_HOST;
  const hostname = new URL(requestOrigin).hostname;
  if (!base || !authHost || !(hostname === base || hostname.endsWith(`.${base}`))) return requestOrigin;
  return slug === HQ_SLUG ? `https://${authHost}` : `https://${slug}.${base}`;
}
