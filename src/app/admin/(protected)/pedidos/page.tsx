"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, RefreshCw, Phone, Printer, Send, Plus } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { formatCurrency, orderStatusLabel, paymentMethodLabel } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import OrderStatusBadge from "@/components/admin/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminEvent } from "@/lib/sse";
import { useOrderStatus } from "@/components/admin/CourierPicker";

const STATUS_TABS = [
  { value: "", label: "Todos" },
  { value: "PENDING", label: "Aguardando" },
  { value: "CONFIRMED", label: "Confirmados" },
  { value: "IN_PRODUCTION", label: "Produção" },
  { value: "READY", label: "Prontos" },
  { value: "DISPATCHED", label: "Enviados" },
  { value: "DELIVERED", label: "Entregues" },
  { value: "CANCELLED", label: "Cancelados" },
];

// Datas locais (YYYY-MM-DD) para o filtro de período
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

const PERIOD_PRESETS = [
  { label: "Hoje", range: () => [ymd(new Date()), ymd(new Date())] },
  { label: "Ontem", range: () => [daysAgo(1), daysAgo(1)] },
  { label: "7 dias", range: () => [daysAgo(6), ymd(new Date())] },
  { label: "30 dias", range: () => [daysAgo(29), ymd(new Date())] },
  { label: "Este mês", range: () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), ymd(n)]; } },
] as const;

const ONLINE_METHODS = ["ONLINE_PIX", "ONLINE_CREDIT", "ONLINE_BOLETO"];

interface Payment {
  method: string;
  status: string;
}

interface Order {
  id: string; number: number; status: string; type: string;
  total: number; createdAt: string; paymentLinkUrl: string | null; priceTier?: string; invoiceDays?: number | null;
  courier?: { id: string; name: string } | null;
  customer: { name: string; phone: string };
  payment: Payment | null;
  items: { name: string; quantity: number }[];
}

interface PrintToast {
  orderId: string;
  orderNumber: number;
  customerName: string;
}

export default function PedidosPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [printToast, setPrintToast] = useState<PrintToast | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (from) params.set("de", from);
      if (to) params.set("ate", to);
      // Com período definido, traz até 100 pedidos em vez da 1ª página de 20
      if (from || to) params.set("limit", "100");
      const { data } = await axios.get(`/api/pedidos?${params}`);
      setOrders(data.orders);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [status, from, to]);

  useEffect(() => { load(); }, [load]);

  // SSE — listen for new/confirmed orders
  useEffect(() => {
    const es = new EventSource("/api/admin/events");
    es.onmessage = (e) => {
      try {
        const event: AdminEvent = JSON.parse(e.data);
        if (event.type === "order_new" || event.type === "order_confirmed") {
          load();
        }
        if (event.type === "order_confirmed") {
          if (toastTimer.current) clearTimeout(toastTimer.current);
          setPrintToast({ orderId: event.orderId, orderNumber: event.orderNumber, customerName: event.customerName ?? "" });
          toastTimer.current = setTimeout(() => setPrintToast(null), 15000);
        }
      } catch { /* ignore parse errors */ }
    };
    return () => { es.close(); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [load]);

  const filtered = search
    ? orders.filter(
        (o) =>
          o.customer.name.toLowerCase().includes(search.toLowerCase()) ||
          o.customer.phone.includes(search) ||
          String(o.number).includes(search)
      )
    : orders;

  // Pedido de entrega sem entregador: o servidor avisa e o seletor abre sozinho
  const { change: updateStatus, modal: courierModal } = useOrderStatus(load);

  async function resendPaymentLink(order: Order) {
    setResendingId(order.id);
    try {
      const { data } = await axios.post(`/api/pedidos/${order.id}/pagamento`);
      const phone = order.customer.phone.replace(/\D/g, "");
      const msg = encodeURIComponent(`Olá ${order.customer.name}! Seu pedido #${order.number} aguarda pagamento.\n\nPague aqui: ${data.paymentLinkUrl}`);
      window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
      load();
    } catch {
      alert("Erro ao gerar link de pagamento");
    } finally {
      setResendingId(null);
    }
  }

  function openRomaneio(orderId: string) {
    window.open(`/api/pedidos/${orderId}/romaneio`, "_blank", "width=600,height=800,popup=1");
  }

  const isUnpaid = (o: Order) =>
    o.payment?.status === "PENDING" &&
    (ONLINE_METHODS.includes(o.payment?.method ?? "") || ["PIX"].includes(o.payment?.method ?? "")) &&
    o.status !== "CANCELLED";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {courierModal}

      {/* Auto-print toast */}
      {printToast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 100,
          background: "#1c1917", color: "#fff", borderRadius: 16, padding: "16px 20px",
          boxShadow: "0 8px 32px rgba(0,0,0,.4)", display: "flex", alignItems: "center", gap: 12, maxWidth: 360,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>
              ✅ Pedido #{printToast.orderNumber} confirmado
            </p>
            <p style={{ fontSize: 12, color: "#a8a29e", margin: "2px 0 0" }}>{printToast.customerName}</p>
          </div>
          <button
            onClick={() => { openRomaneio(printToast.orderId); setPrintToast(null); }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#F26C21", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </button>
          <button onClick={() => setPrintToast(null)} style={{ background: "none", border: "none", color: "#78716c", cursor: "pointer", padding: 4, fontSize: 16 }}>✕</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Pedidos</h1>
          <p className="text-zinc-500 text-sm">{total} pedido{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/pedidos/novo">
            <Button className="bg-orange-500 hover:bg-orange-600"><Plus className="w-4 h-4 mr-1.5" /> Novo pedido</Button>
          </Link>
          <Button onClick={load} variant="outline" size="icon">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto bg-zinc-100 p-1 rounded-xl w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              status === tab.value
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-zinc-500">De</label>
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-auto h-9" />
          <label className="text-xs font-medium text-zinc-500">até</label>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-auto h-9" />
        </div>
        <div className="flex gap-1">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => { const [a, b] = p.range(); setFrom(a); setTo(b); }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            >
              {p.label}
            </button>
          ))}
          {(from || to) && (
            <button onClick={() => { setFrom(""); setTo(""); }} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-orange-600 hover:bg-orange-50">
              Limpar
            </button>
          )}
        </div>
        {(from || to) && !loading && (
          <span className="text-xs text-zinc-500">
            {total} pedido{total !== 1 ? "s" : ""} no período
            {total > orders.length ? ` (mostrando os ${orders.length} mais recentes)` : ""}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, telefone ou nº..."
          className="pl-9"
        />
      </div>

      {/* Orders list */}
      <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <p>Nenhum pedido encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {filtered.map((order) => (
              <div key={order.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 transition-colors ${isUnpaid(order) ? "border-l-4 border-l-amber-400" : ""}`}>
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-orange-700">#{order.number}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-900">{order.customer.name}</p>
                    <a href={`https://wa.me/55${order.customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                      className="text-green-500 hover:text-green-600 transition-colors">
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    {isUnpaid(order) && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                        Aguardando pagamento
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {order.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {format(new Date(order.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    {order.payment && ` · ${paymentMethodLabel(order.payment.method)}${order.payment.method === "INVOICE" && order.invoiceDays ? ` ${order.invoiceDays}d` : ""}`}
                    {order.courier && <span className="ml-1.5 text-[11px] text-zinc-500">🛵 {order.courier.name}</span>}
                    {order.priceTier === "RESELLER" && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800">Revenda</span>}
                    {order.type === "PICKUP" && " · 🏪 Retirada"}
                  </p>
                </div>

                <div className="shrink-0 text-right space-y-1.5">
                  <p className="text-sm font-bold text-zinc-900">{formatCurrency(order.total)}</p>
                  <OrderStatusBadge status={order.status} />
                </div>

                <div className="shrink-0 flex gap-1.5 flex-wrap justify-end">
                  {/* Resend payment link */}
                  {isUnpaid(order) && (
                    <button
                      onClick={() => resendPaymentLink(order)}
                      disabled={resendingId === order.id}
                      className="px-2.5 py-1 bg-amber-500 text-white text-xs rounded-lg hover:bg-amber-600 font-medium flex items-center gap-1"
                    >
                      {resendingId === order.id
                        ? <RefreshCw className="w-3 h-3 animate-spin" />
                        : <Send className="w-3 h-3" />}
                      Cobrar
                    </button>
                  )}

                  {/* Status advance */}
                  {order.status === "PENDING" && !isUnpaid(order) && (
                    <button onClick={() => updateStatus(order.id, "CONFIRMED")}
                      className="px-2.5 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 font-medium">
                      Confirmar
                    </button>
                  )}
                  {order.status === "CONFIRMED" && (
                    <button onClick={() => updateStatus(order.id, "IN_PRODUCTION")}
                      className="px-2.5 py-1 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 font-medium">
                      Produção
                    </button>
                  )}
                  {order.status === "IN_PRODUCTION" && (
                    <button onClick={() => updateStatus(order.id, "READY")}
                      className="px-2.5 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 font-medium">
                      Pronto
                    </button>
                  )}
                  {order.status === "READY" && (
                    <button onClick={() => updateStatus(order.id, "DISPATCHED")}
                      className="px-2.5 py-1 bg-cyan-500 text-white text-xs rounded-lg hover:bg-cyan-600 font-medium">
                      Enviar
                    </button>
                  )}
                  {order.status === "DISPATCHED" && (
                    <button onClick={() => updateStatus(order.id, "DELIVERED")}
                      className="px-2.5 py-1 bg-zinc-700 text-white text-xs rounded-lg hover:bg-zinc-900 font-medium">
                      Entregue
                    </button>
                  )}

                  {/* Print */}
                  <button onClick={() => openRomaneio(order.id)}
                    className="px-2.5 py-1 bg-zinc-100 text-zinc-600 text-xs rounded-lg hover:bg-zinc-200 font-medium flex items-center gap-1">
                    <Printer className="w-3 h-3" />
                  </button>

                  <Link href={`/admin/pedidos/${order.id}`}
                    className="px-2.5 py-1 bg-zinc-100 text-zinc-600 text-xs rounded-lg hover:bg-zinc-200 font-medium">
                    Ver
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
