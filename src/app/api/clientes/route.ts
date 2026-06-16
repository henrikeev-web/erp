import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createCustomerSchema = z.object({
  brandId: z.string(),
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  cpf: z.string().optional(),
  notes: z.string().optional(),
  children: z.array(z.object({
    name: z.string(),
    birthDate: z.string().datetime(),
  })).optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const brandId = searchParams.get("brandId");
  const inactive = searchParams.get("inativo");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const diasSemPedido = searchParams.get("diasSemPedido");
  const semPedido = searchParams.get("semPedido");
  const inactiveDays = diasSemPedido ? parseInt(diasSemPedido) : inactive === "true" ? 30 : null;

  const where: Record<string, unknown> = {
    ...(brandId && { brandId }),
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
  try {
    const body = await req.json();
    const data = createCustomerSchema.parse(body);

    const existing = await prisma.customer.findUnique({ where: { phone: data.phone } });
    if (existing) {
      return NextResponse.json({ error: "Telefone já cadastrado", customerId: existing.id }, { status: 409 });
    }

    const customer = await prisma.customer.create({
      data: {
        brandId: data.brandId,
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
    });

    await prisma.loyaltyCard.create({ data: { customerId: customer.id } });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "Erro ao criar cliente" }, { status: 500 });
  }
}
