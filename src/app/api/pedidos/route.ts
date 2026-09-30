import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireStaff } from "@/lib/api-auth";
import { createOrder, OrderError } from "@/lib/order-service";

const createOrderSchema = z.object({
  customerId: z.string(),
  addressId: z.string().optional(),
  deliveryZoneId: z.string().optional(),
  type: z.enum(["DELIVERY", "PICKUP", "DINE_IN"]).default("DELIVERY"),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  scheduledTo: z.string().datetime().optional(),
  paymentMethod: z.enum([
    "CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD",
    "VOUCHER", "ONLINE_CREDIT", "ONLINE_PIX", "ONLINE_BOLETO",
  ]),
  changeAmount: z.number().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    notes: z.string().optional(),
  })).min(1),
});

// Lista de pedidos do painel. Filtros: status, de/ate (YYYY-MM-DD, inclusivo, fuso do servidor)
export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));

  const createdAt: Record<string, Date> = {};
  if (de) createdAt.gte = new Date(`${de}T00:00:00`);
  if (ate) createdAt.lte = new Date(`${ate}T23:59:59.999`);

  const where: Record<string, unknown> = {
    unitId: auth.unit.id,
    ...(status && { status }),
    ...(Object.keys(createdAt).length && { createdAt }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        address: true,
        deliveryZone: { select: { name: true, fee: true } },
        items: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({ orders, total, page, limit });
}

// Criação pelo painel. O checkout público usa POST /api/checkout.
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  try {
    const data = createOrderSchema.parse(await req.json());
    const order = await createOrder({
      unit: auth.unit,
      ...data,
      scheduledTo: data.scheduledTo ? new Date(data.scheduledTo) : undefined,
      source: "ADMIN",
    });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 422 });
    console.error(error);
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }
}
