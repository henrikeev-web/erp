import { NextResponse } from "next/server";
import { getCurrentUnit } from "@/lib/unit";
import { prisma } from "@/lib/prisma";
import { unitHandle } from "@/lib/payment-link";

export const dynamic = "force-dynamic";

// Unidade resolvida pelo host da request (ver src/proxy.ts)
export async function GET() {
  const unit = await getCurrentUnit();
  if (!unit) return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
  const pay = await prisma.unit.findUnique({ where: { id: unit.id }, select: { type: true, infinitepayHandle: true } });
  return NextResponse.json({ id: unit.id, name: unit.name, slug: unit.slug, type: unit.type, onlinePayment: !!pay && unitHandle(pay) !== null });
}
