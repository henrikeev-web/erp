import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { createFranchise, franchiseLink, franchiseSchema, FranchiseError } from "@/lib/franchise";

export const dynamic = "force-dynamic";

// Lista as franquias da rede (só administrador da matriz)
export async function GET() {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;

  const units = await prisma.unit.findMany({
    where: { brandId: auth.unit.brandId, type: "FRANCHISE" },
    orderBy: { name: "asc" },
    include: {
      franchiseeCustomer: { select: { id: true, name: true, phone: true, email: true } },
      _count: { select: { users: true, orders: true, products: true } },
    },
  });
  return NextResponse.json(units.map((u: any) => ({
    id: u.id, name: u.name, slug: u.slug, city: u.city, state: u.state, active: u.active, createdAt: u.createdAt,
    link: franchiseLink(u.slug), franchisee: u.franchiseeCustomer, counts: u._count,
  })));
}

// Cadastra a franquia completa: unidade + link de acesso + usuários + franqueado (+ cópia do catálogo)
export async function POST(req: NextRequest) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const data = franchiseSchema.parse(await req.json());
    const result = await createFranchise(auth.unit, data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof FranchiseError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    console.error("[franquias]", e);
    return NextResponse.json({ error: "Erro ao cadastrar a franquia" }, { status: 500 });
  }
}
