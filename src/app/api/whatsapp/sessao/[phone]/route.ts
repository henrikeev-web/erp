import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUnitBySlugParam, whatsappAuthOk } from "@/lib/api-auth";

// Sessão do bot por (unidade, telefone). Unidade via ?unit=slug (padrão: matriz).
const ALLOWED = ["state", "cartData", "customerId", "pausedAt", "expiresAt"] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  if (!whatsappAuthOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unit = await resolveUnitBySlugParam(req.nextUrl.searchParams.get("unit"));
  if (unit instanceof NextResponse) return unit;
  const { phone } = await params;

  const session = await (prisma.whatsAppSession as any).findFirst({ where: { unitId: unit.id, phone } });
  if (!session) return NextResponse.json({ phone, state: "IDLE", cartData: null, customerId: null });
  return NextResponse.json(session);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  if (!whatsappAuthOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unit = await resolveUnitBySlugParam(req.nextUrl.searchParams.get("unit"));
  if (unit instanceof NextResponse) return unit;
  const { phone } = await params;
  const body = await req.json();

  // Só campos conhecidos: o bot não pode escolher unitId/phone/id
  const data: Record<string, unknown> = {};
  for (const k of ALLOWED) if (k in body) data[k] = body[k];
  if (data.pausedAt) data.pausedAt = new Date(data.pausedAt as string);
  if (data.expiresAt) data.expiresAt = new Date(data.expiresAt as string);

  const session = await (prisma.whatsAppSession as any).upsert({
    where: { unitId_phone: { unitId: unit.id, phone } },
    create: { unitId: unit.id, phone, ...data },
    update: data,
  });
  return NextResponse.json(session);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  if (!whatsappAuthOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unit = await resolveUnitBySlugParam(req.nextUrl.searchParams.get("unit"));
  if (unit instanceof NextResponse) return unit;
  const { phone } = await params;

  await (prisma.whatsAppSession as any).deleteMany({ where: { unitId: unit.id, phone } });
  return new NextResponse(null, { status: 204 });
}
