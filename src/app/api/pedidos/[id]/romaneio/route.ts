import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCurrency, paymentMethodLabel } from "@/lib/utils";
import { requireStaff } from "@/lib/api-auth";

// Nome, endereço e observações vêm do cliente: sempre escapar antes de montar HTML
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, unitId: auth.unit.id },
    include: {
      customer: { omit: { passwordHash: true } },
      address: { include: { deliveryZone: true } },
      items: true,
      payment: true,
    },
  });

  if (!order) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const html = generateRomaneioHtml(order);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function generateRomaneioHtml(order: {
  number: number;
  createdAt: Date;
  type: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  notes: string | null;
  customer: { name: string; phone: string; email: string | null };
  address: { street: string; number: string; complement: string | null; neighborhood: string; city: string; state: string; cep: string; deliveryZone: { name: string } | null } | null;
  items: { name: string; quantity: number; price: number; total: number; notes: string | null }[];
  payment: { method: string; status: string; changeAmount: number | null } | null;
}) {
  const date = new Date(order.createdAt).toLocaleString("pt-BR");

  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td>${item.quantity}x</td>
        <td>${esc(item.name)}${item.notes ? `<br><small style="color:#666">${esc(item.notes)}</small>` : ""}</td>
        <td style="text-align:right">${formatCurrency(item.price)}</td>
        <td style="text-align:right"><strong>${formatCurrency(item.total)}</strong></td>
      </tr>`
    )
    .join("");

  const address = order.address
    ? `${esc(order.address.street)}, ${esc(order.address.number)}${order.address.complement ? ` — ${esc(order.address.complement)}` : ""}
${esc(order.address.neighborhood)}, ${esc(order.address.city)} — ${esc(order.address.state)}
CEP ${esc(order.address.cep)}
${order.address.deliveryZone ? `[${esc(order.address.deliveryZone.name)}]` : ""}`
    : "RETIRADA NA LOJA";

  const paymentInfo = order.payment
    ? `${paymentMethodLabel(order.payment.method)}${order.payment.changeAmount ? ` (troco para ${formatCurrency(order.payment.changeAmount)})` : ""}`
    : "—";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Romaneio #${order.number}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; max-width: 400px; margin: auto; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
  .header h1 { font-size: 20px; }
  .header h2 { font-size: 14px; color: #555; }
  .section { margin: 10px 0; }
  .section label { font-weight: bold; display: block; font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
  .section p { white-space: pre-line; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table th { background: #f5f5f5; text-align: left; padding: 5px; border-bottom: 1px solid #ddd; font-size: 10px; text-transform: uppercase; }
  table td { padding: 5px; border-bottom: 1px solid #eee; vertical-align: top; }
  .totals { border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; }
  .totals .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .totals .total { font-size: 16px; font-weight: bold; border-top: 1px solid #000; margin-top: 5px; padding-top: 5px; }
  .payment-box { background: #f9f9f9; border: 1px solid #ddd; padding: 8px 12px; margin: 10px 0; border-radius: 4px; }
  .footer { text-align: center; margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 10px; font-size: 10px; color: #888; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="header">
  <h1>🍼 BANGUELAS</h1>
  <h2>Papinhas e Nutrição Infantil</h2>
  <p style="font-size:11px;color:#777;margin-top:4px">${date}</p>
</div>

<div style="display:flex;justify-content:space-between;margin-bottom:10px">
  <div><strong style="font-size:18px">Pedido #${order.number}</strong></div>
  <div style="text-align:right">
    <span style="background:#ff6b00;color:#fff;padding:3px 10px;border-radius:20px;font-weight:bold;font-size:11px">
      ${order.type === "PICKUP" ? "RETIRADA" : "DELIVERY"}
    </span>
  </div>
</div>

<div class="section">
  <label>Cliente</label>
  <p><strong>${esc(order.customer.name)}</strong></p>
  <p>📱 ${esc(order.customer.phone)}</p>
  ${order.customer.email ? `<p>✉️ ${esc(order.customer.email)}</p>` : ""}
</div>

<div class="section">
  <label>Endereço</label>
  <p>${address}</p>
</div>

<table>
  <thead>
    <tr>
      <th>Qtd</th>
      <th>Produto</th>
      <th style="text-align:right">Un.</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

<div class="totals">
  <div class="row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
  ${order.type === "DELIVERY" ? `<div class="row"><span>Frete</span><span>${formatCurrency(order.deliveryFee)}</span></div>` : ""}
  ${order.discount > 0 ? `<div class="row" style="color:green"><span>Desconto</span><span>-${formatCurrency(order.discount)}</span></div>` : ""}
  <div class="row total"><span>TOTAL</span><span>${formatCurrency(order.total)}</span></div>
</div>

<div class="payment-box">
  <strong>💳 Pagamento:</strong> ${paymentInfo}
  ${order.payment?.status === "PAID" ? ' <span style="color:green">✓ PAGO</span>' : ""}
</div>

${order.notes ? `<div class="section"><label>Observações</label><p>${esc(order.notes)}</p></div>` : ""}

<div class="footer">
  Banguelas Papinhas · www.banguelas.com.br<br>
  Impresso em ${new Date().toLocaleString("pt-BR")}
</div>

<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
}
