import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user.role === "ADMIN" ? session : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.cpf !== undefined) data.cpf = body.cpf || null;
  if (body.email !== undefined) data.email = body.email || null;
  if (body.phone !== undefined) data.phone = body.phone || null;
  if (body.schoolName !== undefined) data.schoolName = body.schoolName || null;
  if (body.childName !== undefined) data.childName = body.childName || null;
  if (body.monthlyFee !== undefined) data.monthlyFee = parseFloat(body.monthlyFee);
  if (body.dueDay !== undefined) data.dueDay = parseInt(body.dueDay);
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.active !== undefined) data.active = body.active;

  const updated = await (prisma.schoolParent as any).update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  await (prisma.schoolParent as any).update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
