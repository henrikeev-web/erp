/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { tempPassword } from "@/lib/passwords";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  active: z.boolean().optional(),
  resetPassword: z.boolean().optional(), // gera nova senha provisória (mostrada uma vez)
});

// Edita usuário da franquia: nome, perfil, ativar/desativar, redefinir senha. A franquia nunca fica sem administrador ativo.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; uid: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id, uid } = await params;

  const user = await prisma.user.findFirst({ where: { id: uid, unitId: id, unit: { brandId: auth.unit.brandId, type: "FRANCHISE" } }, select: { id: true, role: true, active: true } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  try {
    const d = patchSchema.parse(await req.json());

    const losesAdmin = user.role === "ADMIN" && user.active && ((d.role !== undefined && d.role !== "ADMIN") || d.active === false);
    if (losesAdmin) {
      const otherAdmins = await prisma.user.count({ where: { unitId: id, role: "ADMIN", active: true, id: { not: uid } } });
      if (otherAdmins === 0) return NextResponse.json({ error: "A franquia precisa ter ao menos um administrador ativo" }, { status: 409 });
    }

    const pwd = d.resetPassword ? tempPassword() : null;
    const updated = await prisma.user.update({
      where: { id: uid },
      data: { ...(d.name !== undefined && { name: d.name }), ...(d.role !== undefined && { role: d.role }), ...(d.active !== undefined && { active: d.active }), ...(pwd && { passwordHash: await bcrypt.hash(pwd, 10) }) },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return NextResponse.json({ ...updated, ...(pwd ? { tempPassword: pwd } : {}) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}
