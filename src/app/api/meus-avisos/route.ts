import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { visibleAnnouncements } from "@/lib/announcements";

export const dynamic = "force-dynamic";

// Avisos da matriz para os usuários desta franquia (qualquer perfil), com o status de leitura de quem pergunta
export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await visibleAnnouncements(auth.unit, auth.userId));
}
