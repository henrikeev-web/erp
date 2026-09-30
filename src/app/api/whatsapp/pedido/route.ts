import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUnitBySlugParam, whatsappAuthOk } from "@/lib/api-auth";
import { createOrder, findOrCreateCustomerByPhone, OrderError } from "@/lib/order-service";

const schema = z.object({
  phone: z.string(),
  unitSlug: z.string().optional(), // padrão: matriz
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })).min(1),
  deliveryZoneId: z.string().optional(),
  addressId: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(["PIX", "CASH", "ONLINE_PIX", "ONLINE_CREDIT", "CREDIT_CARD"]).default("ONLINE_PIX"),
});

// n8n calls this to create an order from a WhatsApp conversation
export async function POST(req: NextRequest) {
  if (!whatsappAuthOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = schema.parse(await req.json());
    const unit = await resolveUnitBySlugParam(data.unitSlug);
    if (unit instanceof NextResponse) return unit;

    const customer = await findOrCreateCustomerByPhone(unit, { phone: data.phone });

    const order = await createOrder({
      unit,
      customerId: customer.id,
      addressId: data.addressId,
      deliveryZoneId: data.deliveryZoneId,
      type: "DELIVERY",
      notes: data.notes,
      paymentMethod: data.paymentMethod,
      items: data.items,
      source: "WHATSAPP",
      pricing: "RETAIL", // o bot nunca aplica preço de revenda
    });

    return NextResponse.json(
      { orderId: order.id, orderNumber: order.number, total: order.total, paymentLinkUrl: order.paymentLinkUrl },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 422 });
    console.error("[whatsapp/pedido]", error);
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }
}
