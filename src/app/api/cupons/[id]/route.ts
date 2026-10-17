import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { parseCoupon } from "@/lib/sanitize";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  // Só campos permitidos (usedCount, unitId… nunca vêm do corpo)
  const parsed = parseCoupon(await req.json().catch(() => null), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  try {
    const coupon = await prisma.coupon.update({ where: { id, unitId: auth.unit.id }, data: parsed.data });
    return NextResponse.json(coupon);
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Código já existe" }, { status: 409 });
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    await prisma.coupon.delete({ where: { id, unitId: auth.unit.id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
  }
}
