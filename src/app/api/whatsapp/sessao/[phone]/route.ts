import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function authOk(req: NextRequest) {
  const key = process.env.WHATSAPP_API_KEY;
  if (!key) return true;
  return req.headers.get("authorization") === `Bearer ${key}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await params;

  const session = await (prisma.whatsAppSession as any).findUnique({ where: { phone } });
  if (!session) return NextResponse.json({ phone, state: "IDLE", cartData: null, customerId: null });
  return NextResponse.json(session);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await params;
  const body = await req.json();

  const session = await (prisma.whatsAppSession as any).upsert({
    where: { phone },
    create: { phone, ...body },
    update: body,
  });
  return NextResponse.json(session);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await params;
  try {
    await (prisma.whatsAppSession as any).delete({ where: { phone } });
  } catch {
    // already gone — fine
  }
  return new NextResponse(null, { status: 204 });
}
