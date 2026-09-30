/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { announcementSchema } from "@/lib/announcement-schema";

export const dynamic = "force-dynamic";

// Lista os avisos da rede (matriz), com quantos usuários já leram
export async function GET() {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;

  const list: any[] = await prisma.announcement.findMany({
    where: { brandId: auth.unit.brandId, source: "MANUAL" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { targets: { select: { unitId: true } }, _count: { select: { reads: true } } },
  });
  const franchises = await prisma.unit.findMany({ where: { brandId: auth.unit.brandId, type: "FRANCHISE" }, select: { id: true, name: true, _count: { select: { users: { where: { active: true } } as any } } as any } }) as any[];
  const users = new Map<string, number>(franchises.map((f) => [f.id, f._count.users]));
  const names = new Map<string, string>(franchises.map((f) => [f.id, f.name]));
  const total = [...users.values()].reduce((a, b) => a + b, 0);

  return NextResponse.json(list.map((a) => {
    const unitIds = a.targets.map((t: any) => t.unitId);
    const audience = a.allUnits ? total : unitIds.reduce((s: number, id: string) => s + (users.get(id) ?? 0), 0);
    return { ...a, targets: undefined, unitIds, unitNames: a.allUnits ? null : unitIds.map((id: string) => names.get(id) ?? "—"), reads: a._count.reads, audience, _count: undefined };
  }));
}

export async function POST(req: NextRequest) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const d = announcementSchema.parse(await req.json());
    if (!d.allUnits) {
      if (d.unitIds.length === 0) return NextResponse.json({ error: "Escolha ao menos uma franquia" }, { status: 400 });
      const ok = await prisma.unit.count({ where: { id: { in: d.unitIds }, brandId: auth.unit.brandId, type: "FRANCHISE" } });
      if (ok !== new Set(d.unitIds).size) return NextResponse.json({ error: "Franquia inválida" }, { status: 400 });
    }
    const created = await prisma.announcement.create({
      data: {
        brandId: auth.unit.brandId, title: d.title, body: d.body, kind: d.kind, level: d.level, createdBy: auth.userId,
        startsAt: d.startsAt ? new Date(d.startsAt) : new Date(), endsAt: d.endsAt ? new Date(d.endsAt) : null,
        allUnits: d.allUnits, ...(d.allUnits ? {} : { targets: { create: [...new Set(d.unitIds)].map((unitId) => ({ unitId })) } }),
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[avisos]", e);
    return NextResponse.json({ error: "Erro ao salvar o aviso" }, { status: 500 });
  }
}
