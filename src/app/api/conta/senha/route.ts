import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { checkNewPassword, passwordAttemptsLockedMs, registerPasswordFailure, clearPasswordFailures } from "@/lib/password-policy";

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

/** Troca a PRÓPRIA senha do painel (qualquer perfil de staff). Exige a senha atual. */
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe a senha atual e a nova senha" }, { status: 400 });
  const { currentPassword, newPassword } = parsed.data;

  const wait = passwordAttemptsLockedMs(auth.userId);
  if (wait > 0) return NextResponse.json({ error: `Muitas tentativas. Tente de novo em ${Math.ceil(wait / 60000)} min.` }, { status: 429 });

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true, email: true, passwordHash: true, active: true } });
  if (!user || !user.active || !user.passwordHash) return NextResponse.json({ error: "Usuário sem senha cadastrada" }, { status: 403 });

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    registerPasswordFailure(auth.userId);
    return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 });
  }
  clearPasswordFailures(auth.userId);

  const problem = checkNewPassword(newPassword, { email: user.email, current: currentPassword });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  return NextResponse.json({ ok: true });
}
