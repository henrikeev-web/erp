/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { isValidSlug } from "./unit-host";
import { clearUnitCache } from "./unit";
import { tempPassword } from "./passwords";
import { syncCatalogToUnit } from "./catalog-sync";
import type { SyncResult } from "./catalog-sync";

/** Subdomínios que não podem ser de franquia: já têm outro papel na rede ou podem confundir. */
export const RESERVED_SLUGS = new Set(["www", "cardapio", "app", "admin", "api", "matriz", "mail", "smtp", "ftp", "static", "assets", "cdn", "painel", "suporte", "teste", "test", "dev", "staging", "franquia", "franquias"]);

/** Link de acesso da franquia: cidade.banguelas.com.br (produção) ou cidade.localhost:3000 (dev). */
export function franchiseLink(slug: string): string {
  const base = process.env.BASE_DOMAIN;
  return base ? `https://${slug}.${base}` : `http://${slug}.localhost:3000`;
}

const onlyDigits = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : v);

export const userInputSchema = z.object({
  name: z.string().trim().min(2, "Nome do usuário obrigatório").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(["ADMIN", "STAFF"], { error: "Perfil inválido" }).default("ADMIN"),
});

export const franchiseSchema = z.object({
  name: z.string().trim().min(2, "Nome da franquia obrigatório").max(120),
  slug: z.string().trim().toLowerCase().refine(isValidSlug, "Link inválido: use letras minúsculas, números e hífen (sem espaços nem acentos)"),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().toUpperCase().length(2, "UF com 2 letras").optional().or(z.literal("")),
  franchisee: z.object({
    name: z.string().trim().min(2, "Nome do franqueado obrigatório").max(120),
    phone: z.preprocess(onlyDigits, z.string().min(10, "Telefone do franqueado com DDD").max(13)),
    email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().email("E-mail do franqueado inválido").optional()),
    document: z.preprocess((v) => (onlyDigits(v) === "" ? undefined : onlyDigits(v)), z.string().regex(/^(\d{11}|\d{14})$/, "CPF (11) ou CNPJ (14 dígitos)").optional()),
  }),
  users: z.array(userInputSchema).min(1, "Cadastre ao menos um usuário para a franquia"),
  copyCatalog: z.boolean().default(true),
});

export class FranchiseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface CreatedUser { id: string; name: string; email: string; role: string; tempPassword: string }

/**
 * Cadastra uma franquia INTEIRA: unidade (com o link de acesso), o franqueado como cliente da matriz e os
 * usuários que vão operar o painel da franquia (senha provisória exibida uma única vez). Opcionalmente já copia
 * o catálogo da matriz. Tudo da unidade é criado numa transação: se algo conflitar, nada fica pela metade.
 */
export async function createFranchise(hq: { id: string; brandId: string }, input: z.infer<typeof franchiseSchema>) {
  if (RESERVED_SLUGS.has(input.slug)) throw new FranchiseError(`O link "${input.slug}" é reservado. Escolha outro.`);
  if (!input.users.some((u) => u.role === "ADMIN")) throw new FranchiseError("Ao menos um usuário da franquia precisa ser administrador");

  const emails = input.users.map((u) => u.email);
  if (new Set(emails).size !== emails.length) throw new FranchiseError("E-mail repetido entre os usuários");

  if (await prisma.unit.findUnique({ where: { slug: input.slug }, select: { id: true } })) throw new FranchiseError(`Já existe uma unidade com o link "${input.slug}"`, 409);
  const taken = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
  if (taken.length) throw new FranchiseError(`E-mail já cadastrado: ${taken.map((t: any) => t.email).join(", ")}`, 409);
  if (await prisma.customer.findFirst({ where: { unitId: hq.id, phone: input.franchisee.phone }, select: { id: true } })) {
    throw new FranchiseError("Já existe um cliente da matriz com o telefone do franqueado", 409);
  }

  // Hash fora da transação (é lento e não deve segurar conexão)
  const users = await Promise.all(input.users.map(async (u) => {
    const pwd = tempPassword();
    return { ...u, tempPassword: pwd, passwordHash: await bcrypt.hash(pwd, 10) };
  }));

  let created: { unitId: string; customerId: string; users: CreatedUser[] };
  try {
    created = await (prisma as any).$transaction(async (tx: any) => {
      const unit = await tx.unit.create({ data: { brandId: hq.brandId, type: "FRANCHISE", name: input.name, slug: input.slug, city: input.city || null, state: input.state || null } });
      const customer = await tx.customer.create({
        data: {
          brandId: hq.brandId, unitId: hq.id, type: "FRANCHISEE", franchiseUnitId: unit.id,
          name: input.franchisee.name, phone: input.franchisee.phone, email: input.franchisee.email ?? null, cpf: input.franchisee.document ?? null,
          notes: `Franqueado — ${input.name}`,
        },
      });
      const rows: CreatedUser[] = [];
      for (const u of users) {
        const row = await tx.user.create({ data: { name: u.name, email: u.email, passwordHash: u.passwordHash, role: u.role, unitId: unit.id } });
        rows.push({ id: row.id, name: row.name, email: row.email, role: row.role, tempPassword: u.tempPassword });
      }
      return { unitId: unit.id, customerId: customer.id, users: rows };
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const t = JSON.stringify(e?.meta ?? "");
      const what = t.includes("cpf") ? "O CPF/CNPJ informado já está cadastrado em outro cliente da matriz"
        : t.includes("phone") ? "Já existe um cliente da matriz com o telefone do franqueado"
        : t.includes("email") ? "E-mail de usuário já cadastrado"
        : t.includes("slug") ? `Já existe uma unidade com o link "${input.slug}"`
        : "Conflito de dados (link, e-mail, telefone ou documento já cadastrados)";
      throw new FranchiseError(what, 409);
    }
    throw e;
  }

  clearUnitCache(); // o cache guarda "unidade inexistente" por 60 s: sem isto o link novo daria 404 no 1º minuto

  let catalog: SyncResult | null = null;
  let catalogError: string | null = null;
  if (input.copyCatalog) {
    try { catalog = await syncCatalogToUnit(hq.id, created.unitId); }
    catch (e: any) { catalogError = e?.message ?? "Erro ao copiar o catálogo"; console.error("[franchise] catálogo:", e); }
  }

  return { unitId: created.unitId, customerId: created.customerId, link: franchiseLink(input.slug), users: created.users, catalog, catalogError };
}
