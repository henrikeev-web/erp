import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { visibleAnnouncements } from "@/lib/announcements";

// Confirma a leitura (por usuário). Só vale para aviso que a unidade realmente pode ver.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const visible = await visibleAnnouncements(auth.unit, auth.userId);
  if (!visible.some((a: any) => a.id === id)) return NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });

  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: auth.userId } },
    update: {},
    create: { announcementId: id, userId: auth.userId, unitId: auth.unit.id },
  });
  return NextResponse.json({ ok: true });
}
