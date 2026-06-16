import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const active = searchParams.get("active");

  const where: any = {};
  if (active === "true") where.active = true;
  if (active === "false") where.active = false;

  const parents = await (prisma.schoolParent as any).findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { invoices: true } },
    },
  });

  return NextResponse.json(parents);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { name, cpf, email, phone, schoolName, childName, monthlyFee, dueDay, notes } = body;

  if (!name || !monthlyFee) {
    return NextResponse.json({ error: "Nome e valor da mensalidade são obrigatórios" }, { status: 400 });
  }

  const brand = await prisma.brand.findFirst();
  if (!brand) return NextResponse.json({ error: "Brand não encontrada" }, { status: 500 });

  const parent = await (prisma.schoolParent as any).create({
    data: {
      brandId: brand.id,
      name,
      cpf: cpf ?? null,
      email: email ?? null,
      phone: phone ?? null,
      schoolName: schoolName ?? null,
      childName: childName ?? null,
      monthlyFee: parseFloat(monthlyFee),
      dueDay: dueDay ? parseInt(dueDay) : 10,
      notes: notes ?? null,
    },
  });

  return NextResponse.json(parent, { status: 201 });
}
