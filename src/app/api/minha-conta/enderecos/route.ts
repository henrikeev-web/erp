import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const addresses = await (prisma.customerAddress as any).findMany({
    where: { customerId: customer!.id },
    include: { deliveryZone: { select: { id: true, name: true, fee: true, freeAbove: true } } },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });

  return NextResponse.json(addresses);
}

const createSchema = z.object({
  label: z.string().default("Casa"),
  cep: z.string().min(8),
  street: z.string().min(2),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().min(2),
  city: z.string().min(2),
  state: z.string().default("SP"),
  deliveryZoneId: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export async function POST(req: Request) {
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const data = parsed.data;

  if (data.isDefault) {
    await (prisma.customerAddress as any).updateMany({
      where: { customerId: customer!.id },
      data: { isDefault: false },
    });
  }

  const address = await (prisma.customerAddress as any).create({
    data: { ...data, customerId: customer!.id },
    include: { deliveryZone: { select: { id: true, name: true, fee: true } } },
  });

  return NextResponse.json(address, { status: 201 });
}
