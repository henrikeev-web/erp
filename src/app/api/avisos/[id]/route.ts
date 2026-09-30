/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { announcementSchema } from "@/lib/announcement-schema";

const patchSchema = announcementSchema.partial().extend({ active: z.boolean().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const existing = await prisma.announcement.findFirst({ where: { id, brandId: auth.unit.brandId, source: "MANUAL" }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });
  try {
    const d = patchSchema.parse(await req.json());
    if (d.allUnits === false && (!d.unitIds || d.unitIds.length === 0)) return NextResponse.json({ error: "Escolha ao menos uma franquia" }, { status: 400 });
    if (d.unitIds?.length) {
      const ok = await prisma.unit.count({ where: { id: { in: d.unitIds }, brandId: auth.unit.brandId, type: "FRANCHISE" } });
      if (ok !== new Set(d.unitIds).size) return NextResponse.json({ error: "Franquia inválida" }, { status: 400 });
    }
    const updated = await (prisma as any).$transaction(async (tx: any) => {
      if (d.allUnits !== undefined || d.unitIds) await tx.announcementTarget.deleteMany({ where: { announcementId: id } });
      return tx.announcement.update({
        where: { id },
        data: {
          ...(d.title !== undefined && { title: d.title }), ...(d.body !== undefined && { body: d.body }),
          ...(d.kind !== undefined && { kind: d.kind }), ...(d.level !== undefined && { level: d.level }),
          ...(d.active !== undefined && { active: d.active }),
          ...(d.startsAt ? { startsAt: new Date(d.startsAt) } : {}),
          ...(d.endsAt !== undefined && { endsAt: d.endsAt ? new Date(d.endsAt) : null }),
          ...(d.allUnits !== undefined && { allUnits: d.allUnits }),
          ...(d.unitIds && d.allUnits !== true ? { targets: { create: [...new Set(d.unitIds)].map((unitId) => ({ unitId })) } } : {}),
        },
      });
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

// Encerra o aviso (deixa de aparecer); o registro de quem leu permanece
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const r = await prisma.announcement.updateMany({ where: { id, brandId: auth.unit.brandId, source: "MANUAL" }, data: { active: false } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });
}
