import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { z } from "zod";

const patchSchema = z.object({
  label: z.string().optional(),
  cep: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  deliveryZoneId: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const address = await (prisma.customerAddress as any).findFirst({
    where: { id, customerId: customer!.id },
  });
  if (!address) return NextResponse.json({ error: "Endereço não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  if (parsed.data.isDefault) {
    await (prisma.customerAddress as any).updateMany({
      where: { customerId: customer!.id },
      data: { isDefault: false },
    });
  }

  const updated = await (prisma.customerAddress as any).update({
    where: { id },
    data: parsed.data,
    include: { deliveryZone: { select: { id: true, name: true, fee: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const address = await (prisma.customerAddress as any).findFirst({
    where: { id, customerId: customer!.id },
  });
  if (!address) return NextResponse.json({ error: "Endereço não encontrado" }, { status: 404 });

  await (prisma.customerAddress as any).delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
