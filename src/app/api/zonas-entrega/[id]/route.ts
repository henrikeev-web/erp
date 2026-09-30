import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { parseCourierFee } from "@/lib/courier-fee";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { id: _id, unitId: _u, courierFee: rawFee, ...data } = await req.json();
  const fee = parseCourierFee(rawFee, auth.role);
  if ("error" in fee) return NextResponse.json({ error: fee.error }, { status: fee.status });
  try {
    const zone = await prisma.deliveryZone.update({ where: { id, unitId: auth.unit.id }, data: { ...data, ...fee.data } });
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
