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

/** Origem pública de uma unidade. Em dev (host fora de BASE_DOMAIN) volta a própria origem da request. */
export function originForUnit(slug: string, requestOrigin: string): string {
  const base = process.env.BASE_DOMAIN;
  const authHost = process.env.AUTH_HOST;
  if (!base || !authHost || !new URL(requestOrigin).hostname.endsWith(base)) return requestOrigin;
  return slug === HQ_SLUG ? `https://${authHost}` : `https://${slug}.${base}`;
}
