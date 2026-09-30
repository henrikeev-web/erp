import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { id: _id, unitId: _u, ...data } = await req.json();
  try {
    const zone = await prisma.deliveryZone.update({ where: { id, unitId: auth.unit.id }, data });
    return NextResponse.json(zone);
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    await prisma.deliveryZone.delete({ where: { id, unitId: auth.unit.id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Zona não encontrada" }, { status: 404 });
  }
}
