import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { awardSchema } from "@/lib/award-schema";
import { evaluateAllFranchises } from "@/lib/awards";

const patchSchema = awardSchema.partial();

// Editar a meta NÃO revoga conquistas já registradas
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const existing = await prisma.award.findFirst({ where: { id, brandId: auth.unit.brandId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Premiação não encontrada" }, { status: 404 });
  try {
    const d = patchSchema.parse(await req.json());
    const updated = await prisma.award.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }), ...(d.description !== undefined && { description: d.description }),
        ...(d.metric !== undefined && { metric: d.metric }), ...(d.threshold !== undefined && { threshold: d.threshold }),
        ...(d.startsAt !== undefined && { startsAt: d.startsAt ? new Date(d.startsAt) : null }),
        ...(d.endsAt !== undefined && { endsAt: d.endsAt ? new Date(d.endsAt) : null }),
        ...(d.reward !== undefined && { reward: d.reward }), ...(d.active !== undefined && { active: d.active }),
      },
    });
    const granted = await evaluateAllFranchises(auth.unit.brandId);
    return NextResponse.json({ ...updated, grantedNow: granted });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

// Encerra a campanha (as conquistas ficam registradas)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const r = await prisma.award.updateMany({ where: { id, brandId: auth.unit.brandId }, data: { active: false } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Premiação não encontrada" }, { status: 404 });
}
