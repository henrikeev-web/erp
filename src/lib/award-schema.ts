import { z } from "zod";

const dt = z.string().datetime({ offset: true });
export const awardSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  metric: z.enum(["ORDERS", "SALES"], { error: "Tipo de meta inválido" }),
  threshold: z.coerce.number({ error: "Meta inválida" }).positive("A meta deve ser maior que zero").max(100_000_000),
  startsAt: dt.nullable().optional().or(z.literal("")),
  endsAt: dt.nullable().optional().or(z.literal("")),
  reward: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().optional(),
});
