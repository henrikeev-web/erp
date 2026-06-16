"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Printer, RefreshCw, ChevronDown, MapPin, Phone } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import OrderStatusBadge from "@/components/admin/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Order {
  id: string; number: number; status: string; type: string; total: number; createdAt: string;
  customer: { name: string; phone: string };
  address: { street: string; number: string; complement: string | null; neighborhood: string; city: string; state: string; cep: string; deliveryZone: { name: string } | null } | null;
  items: { name: string; quantity: number; price: number }[];
  payment: { method: string; status: string; changeAmount: number | null } | null;
  fiscalDocs: { id: string; type: string }[];
}

export default function FiscalPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("DISPATCHED");

  const STATUS_OPTIONS = [
    { value: "", label: "Todos" },
    { value: "READY", label: "Prontos" },
    { value: "DISPATCHED", label: "Enviados" },
    { value: "DELIVERED", label: "Entregues" },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await axios.get(`/api/pedidos?${params}`);
      const filtered = data.orders.filter((o: Order) => {
        if (!date) return true;
        return format(new Date(o.createdAt), "yyyy-MM-dd") === date;
      });
      setOrders(filtered);
      setSelected(new Set(filtered.map((o: Order) => o.id)));
    } finally {
      setLoading(false);
    }
  }, [date, statusFilter]);

  useEffect(() => { load(); }, [load]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map(o => o.id)));
  }

  function printRomaneio(orderId: string) {
    window.open(`/api/pedidos/${orderId}/romaneio`, "_blank");
  }

  function printBatch() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    // Open each in separate tab with a delay to avoid blocking
    ids.forEach((id, i) => {
      setTimeout(() => window.open(`/api/pedidos/${id}/romaneio`, "_blank"), i * 300);
    });
  }

  const selectedOrders = orders.filter(o => selected.has(o.id));

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Documentos Fiscais</h1>
          <p className="text-zinc-500 text-sm">Romaneios de entrega</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600"
            onClick={printBatch}
            disabled={selected.size === 0}
          >
            <Printer className="w-4 h-4 mr-2" />
            Imprimir {selected.size > 0 ? `(${selected.size})` : "selecionados"}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">Data</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
          {STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${statusFilter === opt.value ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Resumo batch */}
      {selected.size > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-orange-700">
            <strong>{selected.size}</strong> pedido{selected.size !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""} ·
            Total: <strong>{formatCurrency(selectedOrders.reduce((s, o) => s + o.total, 0))}</strong>
          </p>
          <button onClick={toggleAll} className="text-xs text-orange-600 hover:underline">
            {selected.size === orders.length ? "Desmarcar todos" : "Marcar todos"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <FileText className="w-12 h-12 mx-auto mb-3 text-zinc-200" />
          <p>Nenhum pedido encontrado para este filtro</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 divide-y divide-zinc-50">
          {/* Header com seleção total */}
          <div className="flex items-center gap-4 px-5 py-3 bg-zinc-50">
            <input type="checkbox" checked={selected.size === orders.length && orders.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-500" />
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{orders.length} pedido{orders.length !== 1 ? "s" : ""}</span>
          </div>

          {orders.map((order) => (
            <div key={order.id} className={`flex items-start gap-4 px-5 py-4 hover:bg-zinc-50 transition-colors ${selected.has(order.id) ? "bg-orange-50/40" : ""}`}>
              <input type="checkbox" checked={selected.has(order.id)} onChange={() => toggleSelect(order.id)}
                className="mt-1 w-4 h-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-500" />

              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-orange-700">#{order.number}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-zinc-900">{order.customer.name}</p>
                  <OrderStatusBadge status={order.status} />
                </div>
                {order.address && (
                  <p className="text-xs text-zinc-500 mt-0.5 flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {order.address.street}, {order.address.number} — {order.address.neighborhood}
                    {order.address.deliveryZone && ` · ${order.address.deliveryZone.name}`}
                  </p>
                )}
                {order.type === "PICKUP" && (
                  <p className="text-xs text-zinc-500 mt-0.5">🏪 Retirada</p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  {order.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                </p>
              </div>

              <div className="shrink-0 text-right space-y-1">
                <p className="text-sm font-bold text-zinc-900">{formatCurrency(order.total)}</p>
                <p className="text-xs text-zinc-400">{format(new Date(order.createdAt), "HH:mm", { locale: ptBR })}</p>
              </div>

              <button
                onClick={() => printRomaneio(order.id)}
                className="shrink-0 w-8 h-8 rounded-lg hover:bg-orange-100 flex items-center justify-center text-zinc-400 hover:text-orange-600 transition-colors"
                title="Imprimir romaneio"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
