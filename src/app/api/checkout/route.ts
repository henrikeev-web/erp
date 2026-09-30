import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { resolveUnit } from "@/lib/api-auth";
import { getSessionPricing } from "@/lib/pricing";
import { RESELLER_INVOICE_DAYS } from "@/lib/invoice-terms";
import { createOrder, findOrCreateCustomerByPhone, OrderError } from "@/lib/order-service";

const schema = z.object({
  // Obrigatório para visitante; ignorado quando há cliente logado na unidade
  customer: z.object({
    name: z.string().min(2),
    phone: z.string().min(10),
    email: z.string().email().optional().or(z.literal("")),
  }).optional(),
  savedAddressId: z.string().optional(),
  address: z.object({
    cep: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string().optional(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string().default("SP"),
  }).optional(),
  deliveryZoneId: z.string().optional(),
  type: z.enum(["DELIVERY", "PICKUP", "DINE_IN"]).default("DELIVERY"),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  paymentMethod: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "VOUCHER", "ONLINE_CREDIT", "ONLINE_PIX", "ONLINE_BOLETO", "INVOICE"]),
  invoiceDays: z.number().int().optional(), // só faturado (revendedor)
  changeAmount: z.number().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    notes: z.string().optional(),
  })).min(1),
});

// Checkout público: cliente, endereço e pedido numa única chamada validada no servidor.
// O cliente nunca informa customerId/addressId de terceiros.
export async function POST(req: NextRequest) {
  const unit = await resolveUnit();
  if (unit instanceof NextResponse) return unit;

  try {
    const data = schema.parse(await req.json());

    const session = await getServerSession(authOptions);
    const loggedIn = session?.user?.role === "CUSTOMER" && session.user.unitId === unit.id;

    // Nível de preço vem da SESSÃO + banco. Nada do corpo da requisição influencia o preço.
    const { tier } = loggedIn ? await getSessionPricing(unit.id) : { tier: "RETAIL" as const };

    // Faturado: só revendedor logado, prazo dentre as opções permitidas
    if (data.paymentMethod === "INVOICE") {
      if (tier !== "RESELLER") throw new OrderError("Forma de pagamento indisponível", 403);
      if (!(RESELLER_INVOICE_DAYS as readonly number[]).includes(data.invoiceDays ?? -1)) throw new OrderError(`Prazo inválido. Opções: ${RESELLER_INVOICE_DAYS.join(", ")} dias`);
    }

    let customerId: string;
    if (loggedIn) {
      customerId = session!.user.id;
    } else {
      if (!data.customer) throw new OrderError("Informe seus dados");
      customerId = (await findOrCreateCustomerByPhone(unit, data.customer)).id;
    }

    let addressId: string | undefined;
    if (data.type === "DELIVERY") {
      if (data.savedAddressId) {
        if (!loggedIn) throw new OrderError("Endereço salvo exige login");
        addressId = data.savedAddressId; // posse conferida no createOrder
      } else if (data.address) {
        const created = await prisma.customerAddress.create({
          data: { customerId, label: "Entrega", ...data.address, deliveryZoneId: data.deliveryZoneId },
        });
        addressId = created.id;
      } else {
        throw new OrderError("Informe o endereço de entrega");
      }
    }

    const order = await createOrder({
      unit,
      customerId,
      addressId,
      deliveryZoneId: data.type === "DELIVERY" ? data.deliveryZoneId : undefined,
      type: data.type,
      notes: data.notes,
      couponCode: data.couponCode,
      paymentMethod: data.paymentMethod,
      changeAmount: data.changeAmount,
      items: data.items,
      source: "STOREFRONT",
      pricing: tier,
      invoiceDays: data.paymentMethod === "INVOICE" ? data.invoiceDays : undefined,
    });

    // Resposta ao cliente sem campos internos do pedido
    const { courierId: _c, courierFee: _cf, courierAssignedAt: _ca, createdBy: _cb, discountNote: _dn, ...safe } = order as Record<string, unknown>;
    return NextResponse.json(safe, { status: 201 });
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados inválidos", details: error.issues }, { status: 422 });
    console.error("[checkout]", error);
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 });
  }
}
