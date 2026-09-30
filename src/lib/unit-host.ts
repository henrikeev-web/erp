// Resolução de unidade a partir do host — sem dependências de servidor, pode rodar no proxy.
export const UNIT_HEADER = "x-unit-slug";
export const HQ_SLUG = "matriz";

// Subdomínios que pertencem à matriz (não são cidades)
const RESERVED_SUBDOMAINS = new Set(["www", "cardapio", "app", "admin"]);

/** cidade.banguelas.com.br → "cidade"; cardapio.banguelas.com.br / localhost → "matriz" */
export function slugFromHost(host: string): string {
  const hostname = host.split(":")[0].toLowerCase();
  const base = process.env.BASE_DOMAIN?.toLowerCase();

  let sub = "";
  if (base && hostname.endsWith(`.${base}`)) sub = hostname.slice(0, -(base.length + 1));
  else if (hostname.endsWith(".localhost")) sub = hostname.slice(0, -".localhost".length);

  if (!sub || sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) return HQ_SLUG;
  return sub;
}

export function isValidSlug(slug: string) {
  return /^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/.test(slug);
}
