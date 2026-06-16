import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const data = await (prisma.customer as any).findUnique({
    where: { id: customer!.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      cpf: true,
      notifWhatsapp: true,
      notifEmail: true,
      notifPromos: true,
      notifReorder: true,
      createdAt: true,
      loyaltyCard: { select: { points: true, tier: true } },
    },
  });

  if (!data) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  return NextResponse.json(data);
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal("")),
  cpf: z.string().optional(),
});

export async function PUT(req: Request) {
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { name, email, cpf } = parsed.data;
  const updated = await (prisma.customer as any).update({
    where: { id: customer!.id },
    data: {
      ...(name ? { name } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(cpf !== undefined ? { cpf: cpf || null } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, cpf: true },
  });

  return NextResponse.json(updated);
}
