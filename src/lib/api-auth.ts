import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { getCurrentUnit, getUnitBySlug } from "./unit";
import { HQ_SLUG, isValidSlug } from "./unit-host";

type Unit = NonNullable<Awaited<ReturnType<typeof getCurrentUnit>>>;

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];

/**
 * Unidade da request para rotas públicas (cardápio, checkout, webhook…).
 * Uso: const u = await resolveUnit(); if (u instanceof NextResponse) return u;
 */
export async function resolveUnit(): Promise<Unit | NextResponse> {
  const unit = await getCurrentUnit();
  if (!unit) return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
  return unit;
}

/**
 * Exige usuário do painel (SUPER_ADMIN/ADMIN/STAFF) cuja unidade seja a do host.
 * SUPER_ADMIN (equipe da matriz) pode operar qualquer unidade.
 * Uso: const a = await requireStaff(); if (a instanceof NextResponse) return a; const { unit } = a;
 */
export async function requireStaff(roles: string[] = STAFF_ROLES): Promise<{ unit: Unit; userId: string; role: string } | NextResponse> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user || !roles.includes(user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const unit = await getCurrentUnit();
  if (!unit) return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });

  if (user.role !== "SUPER_ADMIN" && user.unitId !== unit.id) {
    return NextResponse.json({ error: "Acesso negado a esta unidade" }, { status: 403 });
  }
  return { unit, userId: user.id, role: user.role };
}

/**
 * Autenticação das rotas do bot (n8n): Bearer WHATSAPP_API_KEY.
 * Sem chave configurada só é aceito fora de produção — em produção falha fechado.
 */
export function whatsappAuthOk(req: Request): boolean {
  const key = process.env.WHATSAPP_API_KEY;
  if (!key) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${key}`;
}

/** O bot chama um único host, então informa a unidade explicitamente (?unit= ou body.unitSlug). */
export async function resolveUnitBySlugParam(slug: string | null | undefined): Promise<Unit | NextResponse> {
  const s = (slug || HQ_SLUG).toLowerCase();
  const unit = isValidSlug(s) ? await getUnitBySlug(s) : null;
  if (!unit) return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
  return unit;
}

/**
 * Chave do print-agent: HMAC(PRINT_AGENT_SECRET, slug da unidade). Cada unidade tem a sua,
 * então o agente de uma franquia não consegue ler eventos/pedidos de outra.
 * Gerar: npx tsx scripts/print-agent-key.ts <slug>
 */
export function printAgentKey(slug: string): string | null {
  const secret = process.env.PRINT_AGENT_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(slug).digest("hex");
}

/** Sessão de staff da unidade OU Bearer do print-agent daquela unidade. Só para rotas de leitura do agente. */
export async function requireStaffOrAgent(): Promise<{ unit: Unit } | NextResponse> {
  const bearer = (await headers()).get("authorization")?.replace(/^Bearer /, "");
  if (bearer) {
    const unit = await getCurrentUnit();
    const expected = unit ? printAgentKey(unit.slug) : null;
    if (unit && expected && bearer.length === expected.length && timingSafeEqual(Buffer.from(bearer), Buffer.from(expected))) {
      return { unit };
    }
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  return { unit: auth.unit };
}
