/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { franchiseLink } from "@/lib/franchise";
import { clearUnitCache } from "@/lib/unit";

export const dynamic = "force-dynamic";

async function findFranchise(id: string, brandId: string) {
  return prisma.unit.findFirst({ where: { id, brandId, type: "FRANCHISE" } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const unit: any = await prisma.unit.findFirst({
    where: { id, brandId: auth.unit.brandId, type: "FRANCHISE" },
    include: {
      franchiseeCustomer: { select: { id: true, name: true, phone: true, email: true, cpf: true } },
      users: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } },
      _count: { select: { orders: true, products: true, customers: true } },
    },
  });
  if (!unit) return NextResponse.json({ error: "Franquia não encontrada" }, { status: 404 });
  return NextResponse.json({ ...unit, link: franchiseLink(unit.slug) });
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().toUpperCase().length(2).nullable().optional(),
  active: z.boolean().optional(),
}); // o link (slug) NÃO muda: trocá-lo quebraria os acessos e favoritos da franquia

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!(await findFranchise(id, auth.unit.brandId))) return NextResponse.json({ error: "Franquia não encontrada" }, { status: 404 });
  try {
    const d = patchSchema.parse(await req.json());
    const updated = await prisma.unit.update({ where: { id }, data: d });
    clearUnitCache(); // desativar/reativar vale imediatamente (o link passa a dar 404 / volta)
    return NextResponse.json({ ...updated, link: franchiseLink(updated.slug) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}
