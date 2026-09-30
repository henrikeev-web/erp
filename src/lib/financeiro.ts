/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { prisma } from "./prisma";

/**
 * Financeiro: datas de vencimento são "só data" (coluna @db.Date). Toda a aritmética é em UTC para
 * não depender do fuso do servidor (um vencimento dia 1º nunca vira dia 30 do mês anterior).
 */

export type RecurrencePeriod = "DAY" | "WEEK" | "MONTH" | "YEAR";

/** "2026-10-31" → Date em UTC 00:00. Lança se a data for inválida (ex.: 2026-02-30). */
export function parseDateOnly(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) throw new Error("Data inválida");
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error("Data inválida");
  return d;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// Dia de negócio no fuso da operação (padrão Brasília), independente do fuso do servidor.
const BUSINESS_TZ = process.env.BUSINESS_TZ ?? "America/Sao_Paulo";

export function todayUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(new Date()); // AAAA-MM-DD
  return parseDateOnly(ymd);
}

function daysInMonth(y: number, m0: number) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** Soma meses preservando o dia quando possível; dia inexistente cai no último dia do mês (31/jan + 1 mês = 28/fev). */
export function addMonthsUTC(d: Date, months: number): Date {
  const total = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), daysInMonth(y, m))));
}

export function addDaysUTC(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/**
 * n-ésima cobrança (n=0 é a data inicial). Sempre calculada a partir da data inicial, nunca da anterior:
 * assim uma conta do dia 31 volta ao dia 31 nos meses que têm 31 (não "gruda" no dia 28).
 */
export function occurrenceDate(start: Date, every: number, period: RecurrencePeriod, n: number): Date {
  const k = every * n;
  switch (period) {
    case "DAY": return addDaysUTC(start, k);
    case "WEEK": return addDaysUTC(start, 7 * k);
    case "MONTH": return addMonthsUTC(start, k);
    case "YEAR": return addMonthsUTC(start, 12 * k);
  }
}

export const RECURRENCE_HORIZON_DAYS = 60;
const MAX_PER_RUN = 5000;

const money = (x: number) => Math.round(x * 100) / 100;

/**
 * Gera os lançamentos das recorrências ativas até hoje + horizonte. Idempotente:
 * a unicidade [recurringId, dueDate] impede duplicar, então pode rodar a cada consulta.
 */
export async function materializeRecurring(unitId: string, horizonDays = RECURRENCE_HORIZON_DAYS) {
  const limit = addDaysUTC(todayUTC(), horizonDays);
  const templates = await prisma.recurringEntry.findMany({ where: { unitId, active: true, startDate: { lte: limit } } });

  for (const t of templates as any[]) {
    const last = await prisma.financialEntry.findFirst({ where: { recurringId: t.id }, orderBy: { dueDate: "desc" }, select: { dueDate: true } });
    const stop = t.endDate && t.endDate < limit ? t.endDate : limit;

    const rows: any[] = [];
    for (let n = 0; n < MAX_PER_RUN; n++) {
      const due = occurrenceDate(t.startDate, t.every, t.period, n);
      if (due > stop) break;
      if (last && due <= last.dueDate) continue; // já gerada em execução anterior
      rows.push({
        unitId, type: t.type, description: t.description, amount: t.amount, dueDate: due,
        supplierId: t.supplierId, customerId: t.customerId, costCenterId: t.costCenterId,
        recurringId: t.id, source: "RECURRING",
      });
    }
    if (rows.length) await prisma.financialEntry.createMany({ data: rows, skipDuplicates: true });
  }
}

/** Fornecedor, cliente e centro de custo informados precisam ser da unidade (o body vem do cliente). */
export async function checkOwnership(unitId: string, refs: { supplierId?: string | null; customerId?: string | null; costCenterId?: string | null }): Promise<string | null> {
  if (refs.supplierId && !(await prisma.supplier.findFirst({ where: { id: refs.supplierId, unitId }, select: { id: true } }))) return "Fornecedor inválido";
  if (refs.customerId && !(await prisma.customer.findFirst({ where: { id: refs.customerId, unitId }, select: { id: true } }))) return "Cliente inválido";
  if (refs.costCenterId && !(await prisma.costCenter.findFirst({ where: { id: refs.costCenterId, unitId }, select: { id: true } }))) return "Centro de custo inválido";
  return null;
}

// ── Schemas de entrada ──────────────────────────────────────────────────────

const optId = z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional());
const amountSchema = z.coerce.number({ error: "Valor inválido" }).positive("Valor deve ser maior que zero").max(100_000_000, "Valor muito alto").transform(money);
const dateSchema = z.string({ error: "Data obrigatória" }).refine((v) => { try { parseDateOnly(v); return true; } catch { return false; } }, "Data inválida (use AAAA-MM-DD)");

export const recurrenceSchema = z.object({
  every: z.coerce.number().int("Frequência deve ser um número inteiro").min(1, "Frequência mínima: 1").max(365, "Frequência máxima: 365"),
  period: z.enum(["DAY", "WEEK", "MONTH", "YEAR"], { error: "Período inválido" }),
  startDate: dateSchema.optional(),
  endDate: z.preprocess((v) => (v === "" ? null : v), dateSchema.nullable().optional()),
});

export const entrySchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"], { error: "Tipo inválido" }),
  description: z.string().trim().min(2, "Descrição obrigatória").max(200),
  amount: amountSchema,
  dueDate: dateSchema,
  supplierId: optId,
  customerId: optId,
  costCenterId: optId,
  notes: z.string().trim().max(1000).nullable().optional(),
  installments: z.coerce.number().int().min(1).max(60, "Máximo de 60 parcelas").optional(),
  recurrence: recurrenceSchema.optional(),
});

export const recurringSchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"], { error: "Tipo inválido" }),
  description: z.string().trim().min(2, "Descrição obrigatória").max(200),
  amount: amountSchema,
  every: recurrenceSchema.shape.every,
  period: recurrenceSchema.shape.period,
  startDate: dateSchema,
  endDate: recurrenceSchema.shape.endDate,
  supplierId: optId,
  customerId: optId,
  costCenterId: optId,
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** Só dígitos; CNPJ (14) ou CPF (11). */
export const documentSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\D/g, "") || null : v ?? null),
  z.string().regex(/^(\d{11}|\d{14})$/, "CPF (11) ou CNPJ (14 dígitos)").nullable(),
);
