import { z } from "zod";

const cpf = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\D/g, "") || null : v ?? null),
  z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos").nullable(),
);
const phone = z.preprocess((v) => (typeof v === "string" ? v.replace(/\D/g, "") || null : v ?? null), z.string().min(10, "Telefone com DDD").max(13).nullable());

export const courierSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  phone: phone.optional(),
  pixKey: z.string().trim().max(120).nullable().optional(),
  document: cpf.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

