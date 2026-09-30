import { z } from "zod";

/** Colunas internas do produto: nunca vão para o cardápio público, WhatsApp ou HTML de páginas públicas. */
export const INTERNAL_PRODUCT_FIELDS = {
  resalePrice: true, // preço de revenda: SÓ revendedor logado enxerga (ver src/lib/pricing.ts)
  franchisePrice: true, // preço de reposição do franqueado: só o painel da franquia (ADMIN) e a matriz
  barcode: true,
  ncm: true,
  packWeightG: true,
  packLengthCm: true,
  packWidthCm: true,
  packHeightCm: true,
} as const;

/** Uso: prisma.product.findMany({ omit: PUBLIC_PRODUCT_OMIT, ... }) em toda consulta pública. */
export const PUBLIC_PRODUCT_OMIT = INTERNAL_PRODUCT_FIELDS;

/** Para revendedor logado: mantém `resalePrice` na consulta (é convertido em `price` por applyTierPricing e removido). */
export const RESELLER_PRODUCT_OMIT = { ...INTERNAL_PRODUCT_FIELDS, resalePrice: false } as const;

/** EAN-8, EAN-13, UPC-A (12) e GTIN-14: só dígitos; valida o dígito verificador (mod 10). */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

/** Validação dos campos internos em POST/PUT (cada um é opcional; vazio vira null). */
export const internalFieldsSchema = z.object({
  franchisePrice: z.preprocess(emptyToNull, z.coerce.number({ error: "Preço do franqueado inválido" }).positive("Preço do franqueado deve ser maior que zero").max(100_000, "Preço muito alto").transform((n) => Math.round(n * 100) / 100).nullable()).optional(),
  resalePrice: z.preprocess(emptyToNull, z.coerce.number({ error: "Preço de revenda inválido" }).positive("Preço de revenda deve ser maior que zero").max(100_000, "Preço de revenda muito alto").transform((n) => Math.round(n * 100) / 100).nullable()).optional(),
  barcode: z.preprocess(emptyToNull, z.string().trim().refine(isValidGtin, "Código de barras inválido (EAN/GTIN com dígito verificador correto)").nullable()).optional(),
  ncm: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/\D/g, "") || null : emptyToNull(v)),
    z.string().regex(/^\d{8}$/, "NCM deve ter 8 dígitos").nullable(),
  ).optional(),
  packWeightG: z.preprocess(emptyToNull, z.coerce.number({ error: "Peso inválido" }).int("Peso deve ser um número inteiro de gramas").positive("Peso deve ser maior que zero").max(1_000_000, "Peso muito alto").nullable()).optional(),
  packLengthCm: z.preprocess(emptyToNull, z.coerce.number({ error: "Dimensão inválida" }).positive("Dimensão deve ser maior que zero").max(1000, "Dimensão máxima: 1000 cm").nullable()).optional(),
  packWidthCm: z.preprocess(emptyToNull, z.coerce.number({ error: "Dimensão inválida" }).positive("Dimensão deve ser maior que zero").max(1000, "Dimensão máxima: 1000 cm").nullable()).optional(),
  packHeightCm: z.preprocess(emptyToNull, z.coerce.number({ error: "Dimensão inválida" }).positive("Dimensão deve ser maior que zero").max(1000, "Dimensão máxima: 1000 cm").nullable()).optional(),
});

/** Extrai e valida só os campos internos do body; devolve os dados limpos ou a mensagem de erro. */
export function parseInternalFields(body: Record<string, unknown>) {
  const input: Record<string, unknown> = {};
  for (const k of Object.keys(INTERNAL_PRODUCT_FIELDS)) if (k in body) input[k] = body[k];
  const r = internalFieldsSchema.safeParse(input);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Dados inválidos" } as const;
  return { data: r.data } as const;
}
