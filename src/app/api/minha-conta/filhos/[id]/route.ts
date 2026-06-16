import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  birthDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const child = await (prisma.child as any).findFirst({
    where: { id, customerId: customer!.id },
  });
  if (!child) return NextResponse.json({ error: "Filho não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const updated = await (prisma.child as any).update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.birthDate ? { birthDate: new Date(parsed.data.birthDate) } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, error } = await getCustomerSession();
  if (error) return error;

  const child = await (prisma.child as any).findFirst({
    where: { id, customerId: customer!.id },
  });
  if (!child) return NextResponse.json({ error: "Filho não encontrado" }, { status: 404 });

  await (prisma.child as any).delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
