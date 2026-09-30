/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { documentSchema } from "@/lib/financeiro";

export const dynamic = "force-dynamic";
const ROLES = ["SUPER_ADMIN", "ADMIN"];

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  document: documentSchema.optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().email("E-mail inválido").nullable().optional()),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  const all = new URL(req.url).searchParams.get("todos") === "true";
  const list = await prisma.supplier.findMany({ where: { unitId: auth.unit.id, ...(all ? {} : { active: true }) }, orderBy: { name: "asc" } });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    const d = supplierSchema.parse(await req.json());
    const created = await prisma.supplier.create({ data: { ...d, unitId: auth.unit.id } });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (e?.code === "P2002") return NextResponse.json({ error: "Já existe fornecedor com este CPF/CNPJ" }, { status: 409 });
    console.error("[financeiro/fornecedores]", e);
    return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
  }
}
