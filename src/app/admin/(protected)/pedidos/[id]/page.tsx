import { prisma } from "@/lib/prisma";
import { getCurrentUnit } from "@/lib/unit";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency, orderStatusLabel, paymentMethodLabel } from "@/lib/utils";
import OrderStatusBadge from "@/components/admin/OrderStatusBadge";
import OrderActions from "@/components/admin/OrderActions";
import Link from "next/link";
import { ArrowLeft, FileText, Phone, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const unit = await getCurrentUnit();
  if (!unit) notFound();

  const order = await prisma.order.findFirst({
    where: { id, unitId: unit.id },
    include: {
      customer: { include: { children: true, loyaltyCard: true } },
      address: { include: { deliveryZone: true } },
      items: true,
      payment: true,
      fiscalDocs: true,
    },
  });

  if (!order) notFound();

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/pedidos" className="text-zinc-400 hover:text-zinc-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
            Pedido #{order.number}
            <OrderStatusBadge status={order.status} />
          </h1>
          <p className="text-zinc-500 text-sm">
            {format(order.createdAt, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Cliente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-zinc-900">{order.customer.name}</p>
              <a href={`https://wa.me/55${order.customer.phone.replace(/\D/g, "")}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-green-500 text-sm hover:underline">
                <Phone className="w-3.5 h-3.5" /> {order.customer.phone}
              </a>
            </div>
            {order.customer.email && <p className="text-sm text-zinc-500">{order.customer.email}</p>}
            {order.customer.loyaltyCard && (
              <p className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-lg inline-block">
                ⭐ {order.customer.loyaltyCard.points} pontos · {order.customer.loyaltyCard.tier}
              </p>
            )}
            <Link href={`/admin/clientes/${order.customer.id}`}
              className="text-xs text-orange-500 hover:underline block">
              Ver perfil completo →
            </Link>
          </CardContent>
        </Card>

        {/* Entrega */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
              {order.type === "PICKUP" ? "Retirada" : "Entrega"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.type === "PICKUP" ? (
              <p className="text-sm text-zinc-600">🏪 Cliente irá retirar na loja</p>
            ) : order.address ? (
              <div className="space-y-1">
                <p className="font-medium text-zinc-900 flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                  {order.address.street}, {order.address.number}
                  {order.address.complement && ` — ${order.address.complement}`}
                </p>
                <p className="text-sm text-zinc-500 pl-5.5">{order.address.neighborhood}, {order.address.city} — {order.address.state}</p>
                <p className="text-sm text-zinc-500 pl-5.5">CEP {order.address.cep}</p>
                {order.address.deliveryZone && (
                  <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg inline-block ml-0.5">
                    📍 {order.address.deliveryZone.name}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Endereço não informado</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Itens */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Itens do pedido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 px-0">
          <div className="divide-y divide-zinc-50">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{item.name}</p>
                  {item.notes && <p className="text-xs text-zinc-400 italic">{item.notes}</p>}
                </div>
                <div className="text-right ml-4 shrink-0">
                  <p className="text-sm text-zinc-600">{item.quantity}x {formatCurrency(item.price)}</p>
                  <p className="text-sm font-bold text-zinc-900">{formatCurrency(item.total)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 pt-3 border-t space-y-1.5 text-sm">
            <div className="flex justify-between text-zinc-500">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.type === "DELIVERY" && (
              <div className="flex justify-between text-zinc-500">
                <span>Taxa de entrega</span>
                <span>{order.deliveryFee > 0 ? formatCurrency(order.deliveryFee) : "Grátis"}</span>
              </div>
            )}
            {order.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Desconto {order.couponCode && `(${order.couponCode})`}</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t">
              <span>Total</span>
              <span className="text-orange-600">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pagamento */}
      {order.payment && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-500">Forma</span>
              <span className="font-medium">{paymentMethodLabel(order.payment.method)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Status</span>
              <span className={`font-medium ${order.payment.status === "PAID" ? "text-green-600" : "text-amber-600"}`}>
                {order.payment.status === "PAID" ? "Pago" : order.payment.status === "PENDING" ? "Aguardando" : order.payment.status}
              </span>
            </div>
            {order.payment.changeAmount && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Troco para</span>
                <span>{formatCurrency(order.payment.changeAmount)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ações */}
      <OrderActions order={{ id: order.id, status: order.status, number: order.number }} />

      {/* Documentos fiscais */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Documentos</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {order.fiscalDocs.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhum documento emitido</p>
          ) : (
            <div className="space-y-2">
              {order.fiscalDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm text-zinc-700">{doc.type} {doc.number && `#${doc.number}`}</span>
                  </div>
                  {doc.pdfUrl && (
                    <a href={doc.pdfUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-orange-500 hover:underline">
                      Download PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
