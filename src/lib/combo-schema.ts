import { z } from "zod";

const money = z.coerce.number({ error: "Preço inválido" }).positive("Preço deve ser maior que zero").max(100_000, "Preço muito alto").transform((n) => Math.round(n * 100) / 100);
const optInt = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().nullable());

export const comboSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  price: money,                                   // preço FIXO do combo
  comboSize: z.coerce.number({ error: "Quantidade inválida" }).int("Quantidade deve ser um número inteiro"),
  categoryId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
  ageMin: optInt.optional(),
  ageMax: optInt.optional(),
  items: z.array(z.object({
    productId: z.string(),
    maxQty: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int("Limite deve ser inteiro").nullable()),
  })).min(1, "Escolha ao menos um produto para compor o combo"),
});
