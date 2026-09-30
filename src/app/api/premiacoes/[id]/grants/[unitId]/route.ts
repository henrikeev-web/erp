import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";

const schema = z.object({ delivered: z.boolean(), note: z.string().trim().max(300).nullable().optional() });

// A matriz marca que entregou (ou desfez a entrega de) o prêmio daquela franquia
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id, unitId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const grant = await prisma.awardGrant.findFirst({ where: { awardId: id, unitId, award: { brandId: auth.unit.brandId } }, select: { id: true } });
  if (!grant) return NextResponse.json({ error: "Conquista não encontrada" }, { status: 404 });
  const updated = await prisma.awardGrant.update({ where: { id: grant.id }, data: { deliveredAt: parsed.data.delivered ? new Date() : null, ...(parsed.data.note !== undefined && { note: parsed.data.note }) } });
  return NextResponse.json(updated);
}
