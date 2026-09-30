/**
 * Custo do entregador por entrega na região. Valor interno: só ADMIN define; nunca é público.
 * Devolve `{ data }` (vazio se não foi enviado) ou `{ error, status }`.
 */
export function parseCourierFee(raw: unknown, role: string): { data: { courierFee?: number } } | { error: string; status: number } {
  if (raw === undefined) return { data: {} };
  if (!["SUPER_ADMIN", "ADMIN"].includes(role)) return { error: "Apenas administradores definem o custo do entregador", status: 403 };
  const n = typeof raw === "string" ? parseFloat(raw.replace(",", ".")) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 10_000) return { error: "Custo do entregador inválido (0 a 10.000)", status: 400 };
  return { data: { courierFee: Math.round(n * 100) / 100 } };
}
