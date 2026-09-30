import { z } from "zod";

export const announcementSchema = z.object({
  title: z.string().trim().min(2, "Título obrigatório").max(120),
  body: z.string().trim().min(1, "Escreva a mensagem").max(3000),
  kind: z.enum(["POPUP", "NOTICE"]).default("NOTICE"),
  level: z.enum(["INFO", "SUCCESS", "WARNING"]).default("INFO"),
  startsAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  endsAt: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("")),
  allUnits: z.boolean().default(true),
  unitIds: z.array(z.string()).default([]),
});

