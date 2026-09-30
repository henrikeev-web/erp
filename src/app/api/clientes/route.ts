import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireStaff } from "@/lib/api-auth";
import bcrypt from "bcryptjs";
import { tempPassword } from "@/lib/passwords";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];

const createCustomerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  cpf: z.string().optional(),
  type: z.enum(["RETAIL", "RESELLER"]).default("RETAIL"),
  notes: z.string().optional(),
  children: z.array(z.object({
    name: z.string(),
    birthDate: z.string().datetime(),
  })).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const inactive = searchParams.get("inativo");
  const tipo = searchParams.get("tipo");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const diasSemPedido = searchParams.get("diasSemPedido");
  const semPedido = searchParams.get("semPedido");
  const inactiveDays = diasSemPedido ? parseInt(diasSemPedido) : inactive === "true" ? 30 : null;

  const where: Record<string, unknown> = {
    unitId: unit.id,
    ...(tipo && ["RETAIL", "RESELLER", "FRANCHISEE"].includes(tipo) && { type: tipo }),
    ...(semPedido === "true" && { lastOrderAt: null }),
    ...(inactiveDays != null && !semPedido && {
      OR: [
        { lastOrderAt: { lt: new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000) } },
        { lastOrderAt: null },
      ],
    }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      omit: { passwordHash: true },
      include: {
        children: true,
        loyaltyCard: { select: { points: true, tier: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json({ customers, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { unit } = auth;

  try {
    const body = await req.json();
    const data = createCustomerSchema.parse(body);

    // Só ADMIN cadastra revendedor (quem tem acesso a preço de revenda)
    if (data.type === "RESELLER" && !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: "Apenas administradores cadastram revendedores" }, { status: 403 });
    }
    const existing = await prisma.customer.findFirst({ where: { unitId: unit.id, phone: data.phone } });
    if (existing) {
      return NextResponse.json({ error: "Telefone já cadastrado", customerId: existing.id }, { status: 409 });
    }

    // Revendedor entra com senha provisória definida pelo admin (trocável depois)
    const provisional = data.type === "RESELLER" ? tempPassword() : null;
    const customer = await prisma.customer.create({
      data: {
        type: data.type,
        passwordHash: provisional ? await bcrypt.hash(provisional, 10) : undefined,
        brandId: unit.brandId,
        unitId: unit.id,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        cpf: data.cpf || null,
        notes: data.notes,
        children: data.children
          ? { create: data.children.map((c) => ({ name: c.name, birthDate: new Date(c.birthDate) })) }
          : undefined,
      },
      include: { children: true, loyaltyCard: true },
      omit: { passwordHash: true },
    });

    await prisma.loyaltyCard.create({ data: { customerId: customer.id } });

    // A senha provisória sai UMA vez, só nesta resposta ao admin (não é guardada em texto)
    return NextResponse.json({ ...customer, ...(provisional ? { tempPassword: provisional } : {}) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "Erro ao criar cliente" }, { status: 500 });
  }
}
