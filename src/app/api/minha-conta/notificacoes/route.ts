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
      notifWhatsapp: true,
      notifEmail: true,
      notifPromos: true,
      notifReorder: true,
    },
  });

  return NextResponse.json(data ?? {});
}

const schema = z.object({
  notifWhatsapp: z.boolean().optional(),
  notifEmail: z.boolean().optional(),
  notifPromos: z.boolean().optional(),
  notifReorder: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const updated = await (prisma.customer as any).update({
    where: { id: customer!.id },
    data: parsed.data,
    select: {
      notifWhatsapp: true,
      notifEmail: true,
      notifPromos: true,
      notifReorder: true,
    },
  });

  return NextResponse.json(updated);
}
