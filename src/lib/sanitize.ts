/** Validação de entrada do painel por LISTA DE CAMPOS PERMITIDOS (nunca "tudo menos alguns"). Módulo puro, testável. */
type Out<T> = { data: T } | { error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const blank = (v: unknown) => v === undefined || v === null || v === "";

function num(v: unknown, label: string, o: { min?: number; max: number; int?: boolean; nullable?: boolean; positive?: boolean }): number | null | { error: string } {
  if (blank(v)) return o.nullable ? null : { error: `${label} é obrigatório` };
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return { error: `${label} inválido` };
  if (o.int && !Number.isInteger(n)) return { error: `${label} deve ser inteiro` };
  if (o.positive && n <= 0) return { error: `${label} deve ser maior que zero` };
  if (n < (o.min ?? 0) || n > o.max) return { error: `${label} fora do limite permitido` };
  return o.int ? n : Math.round(n * 100) / 100;
}
function str(v: unknown, label: string, max: number, nullable = true): string | null | { error: string } {
  if (blank(v)) return nullable ? null : { error: `${label} é obrigatório` };
  if (typeof v !== "string") return { error: `${label} inválido` };
  const t = v.trim();
  if (!t) return nullable ? null : { error: `${label} é obrigatório` };
  return t.length > max ? { error: `${label} muito longo (máx. ${max})` } : t;
}
const isErr = (v: unknown): v is { error: string } => isObj(v) && "error" in v;

/** Campos básicos do produto (os internos — preço de revenda, EAN, NCM… — têm validação própria em product-fields). */
export function parseProductBasics(body: unknown): Out<Record<string, unknown>> {
  if (!isObj(body)) return { error: "Dados inválidos" };
  const d: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (isErr(v)) return v; d[k] = v; return null; };
  const rules: [string, () => unknown][] = [
    ["name", () => str(body.name, "Nome", 200, false)],
    ["description", () => str(body.description, "Descrição", 2000)],
    ["price", () => num(body.price, "Preço", { max: 100_000, positive: true })],
    ["priceOriginal", () => num(body.priceOriginal, "Preço original", { max: 100_000, positive: true, nullable: true })],
    ["sku", () => str(body.sku, "SKU", 60)],
    ["ageMin", () => num(body.ageMin, "Idade mínima", { max: 240, int: true, nullable: true })],
    ["ageMax", () => num(body.ageMax, "Idade máxima", { max: 240, int: true, nullable: true })],
    ["weight", () => num(body.weight, "Peso", { max: 100_000, nullable: true })],
    ["servings", () => num(body.servings, "Porções", { max: 1000, int: true, nullable: true })],
    ["ingredients", () => str(body.ingredients, "Ingredientes", 2000)],
    ["allergens", () => str(body.allergens, "Alérgenos", 2000)],
    ["order", () => num(body.order, "Ordem", { min: -100_000, max: 100_000, int: true })],
  ];
  for (const [k, run] of rules) if (k in body) { const e = set(k, run()); if (e) return e; }
  if ("categoryId" in body) { const c = str(body.categoryId, "Categoria", 64); if (isErr(c)) return c; d.categoryId = c; }
  for (const k of ["frozen", "active", "featured"]) if (k in body) { if (typeof body[k] !== "boolean") return { error: `${k} inválido` }; d[k] = body[k]; }
  return { data: d };
}

/** Cupom (criação e edição): só estes campos, com tipos e limites. Edição: só o que veio. */
export function parseCoupon(body: unknown, partial: boolean): Out<Record<string, unknown>> {
  if (!isObj(body)) return { error: "Dados inválidos" };
  const d: Record<string, unknown> = {};
  if ("type" in body || !partial) {
    if (!["PERCENTAGE", "FIXED", "FREE_DELIVERY"].includes(body.type as string)) return { error: "Tipo de cupom inválido" };
    d.type = body.type;
  }
  if ("code" in body || !partial) {
    const c = str(body.code, "Código", 40, false); if (isErr(c)) return c;
    if (!/^[A-Za-z0-9_-]+$/.test(c as string)) return { error: "Código só pode ter letras, números, hífen e sublinhado" };
    d.code = (c as string).toUpperCase();
  }
  if ("description" in body) { const x = str(body.description, "Descrição", 300); if (isErr(x)) return x; d.description = x; }
  const type = (d.type ?? body.type) as string | undefined;
  if ("value" in body || !partial) {
    const v = type === "FREE_DELIVERY" ? 0 : num(body.value, "Valor", { max: type === "PERCENTAGE" ? 100 : 100_000, positive: true });
    if (isErr(v)) return v; d.value = v;
  }
  for (const [k, label, max, nullable] of [["minOrder", "Pedido mínimo", 100_000, false], ["maxDiscount", "Desconto máximo", 100_000, true]] as const) {
    if (k in body) { const v = num(body[k] ?? (nullable ? null : 0), label, { max, nullable }); if (isErr(v)) return v; d[k] = v; }
  }
  for (const [k, label, max] of [["maxUses", "Limite de usos", 1_000_000], ["ageMin", "Idade mínima", 240], ["ageMax", "Idade máxima", 240]] as const) {
    if (k in body) { const v = num(body[k], label, { max, int: true, nullable: true }); if (isErr(v)) return v; d[k] = v; }
  }
  for (const k of ["validFrom", "validTo"] as const) {
    if (k in body) {
      if (blank(body[k])) { if (k === "validFrom") continue; d[k] = null; continue; }
      // "yyyy-MM-dd" do campo de data = dia inteiro em Brasília (início para "válido de", fim para "válido até")
      const raw = String(body[k]);
      const dt = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T${k === "validFrom" ? "00:00:00.000" : "23:59:59.999"}-03:00` : raw);
      if (Number.isNaN(dt.getTime())) return { error: "Data inválida" };
      d[k] = dt;
    }
  }
  for (const k of ["firstOrderOnly", "active"] as const) if (k in body) { if (typeof body[k] !== "boolean") return { error: `${k} inválido` }; d[k] = body[k]; }
  return { data: d };
}

/** Movimentação de estoque. */
export function parseStockMove(body: unknown): Out<{ type: "IN" | "OUT" | "ADJUSTMENT"; quantity: number; reason: string | null }> {
  if (!isObj(body)) return { error: "Dados inválidos" };
  const type = body.type;
  if (type !== "IN" && type !== "OUT" && type !== "ADJUSTMENT") return { error: "Tipo de movimentação inválido" };
  const q = num(body.quantity, "Quantidade", { min: type === "ADJUSTMENT" ? 0 : 1, max: 1_000_000, int: true });
  if (isErr(q) || q === null) return isErr(q) ? q : { error: "Quantidade inválida" };
  const reason = str(body.reason, "Motivo", 200); if (isErr(reason)) return reason;
  return { data: { type, quantity: q, reason } };
}

/** URL do webservice NFS-e: só https e só domínio da GISS (o servidor envia o XML assinado e o certificado para lá). */
export function isGissUrl(u: unknown): boolean {
  if (typeof u !== "string") return false;
  try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === "giss.com.br" || x.hostname.endsWith(".giss.com.br")) && !x.username && !x.password; } catch { return false; }
}
