/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireHQAdmin } from "@/lib/api-auth";
import { awardSchema } from "@/lib/award-schema";
import { evaluateAllFranchises, evaluateAwards, progressFor } from "@/lib/awards";

export const dynamic = "force-dynamic";

/**
 * MATRIZ (admin): todas as premiações com o progresso de CADA franquia e as conquistas.
 * FRANQUIA (qualquer perfil): as premiações ativas da rede com o progresso DELA, sem expor as outras franquias.
 */
export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;

  if (unit.type === "HQ") {
    if (!["ADMIN", "SUPER_ADMIN"].includes(auth.role)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    await evaluateAllFranchises(unit.brandId);
    const awards: any[] = await prisma.award.findMany({ where: { brandId: unit.brandId }, orderBy: [{ active: "desc" }, { createdAt: "desc" }], include: { grants: { select: { unitId: true, achievedAt: true, value: true, deliveredAt: true, note: true } } } });
    const franchises = await prisma.unit.findMany({ where: { brandId: unit.brandId, type: "FRANCHISE", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const perUnit = new Map<string, any[]>();
    for (const f of franchises) perUnit.set(f.id, await progressFor(f.id, awards));
    return NextResponse.json({
      role: "HQ",
      awards: awards.map((a) => ({
        ...a,
        progress: franchises.map((f: any) => {
          const p = perUnit.get(f.id)!.find((x) => x.awardId === a.id)!;
          const g = a.grants.find((x: any) => x.unitId === f.id);
          return { unitId: f.id, unitName: f.name, value: p.value, pct: p.pct, achievedAt: g?.achievedAt ?? null, deliveredAt: g?.deliveredAt ?? null, note: g?.note ?? null };
        }),
      })),
    });
  }

  await evaluateAwards(unit.id);
  const awards: any[] = await prisma.award.findMany({ where: { brandId: unit.brandId, active: true }, orderBy: { createdAt: "desc" }, include: { grants: { where: { unitId: unit.id }, select: { achievedAt: true, deliveredAt: true } } } });
  const prog = await progressFor(unit.id, awards);
  return NextResponse.json({
    role: "FRANCHISE",
    awards: awards.map((a) => {
      const p = prog.find((x) => x.awardId === a.id)!;
      return { id: a.id, name: a.name, description: a.description, metric: a.metric, threshold: a.threshold, startsAt: a.startsAt, endsAt: a.endsAt, reward: a.reward, value: p.value, pct: a.grants[0] ? 100 : p.pct, achievedAt: a.grants[0]?.achievedAt ?? null, deliveredAt: a.grants[0]?.deliveredAt ?? null };
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const d = awardSchema.parse(await req.json());
    const startsAt = d.startsAt ? new Date(d.startsAt) : null, endsAt = d.endsAt ? new Date(d.endsAt) : null;
    if (startsAt && endsAt && endsAt < startsAt) return NextResponse.json({ error: "O fim da campanha é anterior ao início" }, { status: 400 });
    const created = await prisma.award.create({ data: { brandId: auth.unit.brandId, name: d.name, description: d.description ?? null, metric: d.metric, threshold: d.threshold, startsAt, endsAt, reward: d.reward ?? null, active: d.active ?? true } });
    const granted = await evaluateAllFranchises(auth.unit.brandId); // alguma franquia já pode ter atingido
    return NextResponse.json({ ...created, grantedNow: granted }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[premiacoes]", e);
    return NextResponse.json({ error: "Erro ao salvar a premiação" }, { status: 500 });
  }
}
