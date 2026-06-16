import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const children = await (prisma.child as any).findMany({
    where: { customerId: customer!.id },
    orderBy: { birthDate: "asc" },
  });

  return NextResponse.json(children);
}

const createSchema = z.object({
  name: z.string().min(2),
  birthDate: z.string(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const child = await (prisma.child as any).create({
    data: {
      customerId: customer!.id,
      name: parsed.data.name,
      birthDate: new Date(parsed.data.birthDate),
      notes: parsed.data.notes,
    },
  });

  return NextResponse.json(child, { status: 201 });
}
