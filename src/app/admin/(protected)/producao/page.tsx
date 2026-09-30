"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChefHat, RefreshCw, Check, Package, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useOrderStatus } from "@/components/admin/CourierPicker";

interface OrderItem { name: string; quantity: number; price: number; components?: { name: string; quantity: number }[] }
interface Order {
  id: string; number: number; status: string; total: number; createdAt: string;
  scheduledTo: string | null;
  customer: { name: string; phone: string };
  items: OrderItem[];
}

interface ProductionItem {
  name: string;
  totalQty: number;
  orders: { number: number; qty: number }[];
}

export default function ProducaoPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [view, setView] = useState<"por-pedido" | "por-produto">("por-produto");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [confirmed, production] = await Promise.all([
        axios.get("/api/pedidos?status=CONFIRMED&limit=100"),
        axios.get("/api/pedidos?status=IN_PRODUCTION&limit=100"),
      ]);
      setOrders([...confirmed.data.orders, ...production.data.orders]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Pedido de entrega sem entregador: o servidor avisa e o seletor abre sozinho
  const { change, modal: courierModal } = useOrderStatus(load);

  async function advance(order: Order) {
    setUpdating(order.id);
    try {
      await change(order.id, order.status === "CONFIRMED" ? "IN_PRODUCTION" : "READY");
    } finally {
      setUpdating(null);
    }
  }

  const confirmed = orders.filter(o => o.status === "CONFIRMED");
  const inProduction = orders.filter(o => o.status === "IN_PRODUCTION");

  const productionMap: Record<string, ProductionItem> = {};
  orders.forEach(order => {
    // Combo: a cozinha prepara os produtos escolhidos (componentes), não "o combo"
    order.items.flatMap(item => (item.components?.length ? item.components : [item])).forEach(item => {
      if (!productionMap[item.name]) productionMap[item.name] = { name: item.name, totalQty: 0, orders: [] };
      productionMap[item.name].totalQty += item.quantity;
      productionMap[item.name].orders.push({ number: order.number, qty: item.quantity });
    });
  });
  const productionList = Object.values(productionMap).sort((a, b) => b.totalQty - a.totalQty);

  function OrderCard({ order }: { order: Order }) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-100 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-400">#{order.number}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.status === "CONFIRMED" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                {order.status === "CONFIRMED" ? "Confirmado" : "Em produção"}
              </span>
            </div>
            <p className="text-sm font-semibold text-zinc-900 mt-0.5">{order.customer.name}</p>
            <p className="text-xs text-zinc-400">{format(new Date(order.createdAt), "HH:mm", { locale: ptBR })}</p>
          </div>
          <p className="text-sm font-bold text-zinc-900">{formatCurrency(order.total)}</p>
        </div>
        <div className="space-y-1 border-t border-zinc-50 pt-2">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                {item.quantity}
              </span>
              <span className="text-zinc-700">
                {item.name}
                {item.components?.length ? <span className="block text-xs text-zinc-400">{item.components.map(c => `${c.quantity}× ${c.name}`).join(" · ")}</span> : null}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => advance(order)}
          disabled={updating === order.id}
          className={`w-full py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            order.status === "CONFIRMED"
              ? "bg-purple-500 hover:bg-purple-600 text-white"
              : "bg-green-500 hover:bg-green-600 text-white"
          }`}
        >
          {updating === order.id ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : order.status === "CONFIRMED" ? (
            <><ChefHat className="w-4 h-4" /> Iniciar produção</>
          ) : (
            <><Check className="w-4 h-4" /> Marcar como pronto</>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      {courierModal}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Produção</h1>
          <p className="text-zinc-500 text-sm">
            {confirmed.length} aguardando · {inProduction.length} em produção
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
            {[
              { value: "por-produto", label: "Por produto" },
              { value: "por-pedido", label: "Por pedido" },
            ].map(opt => (
              <button key={opt.value} onClick={() => setView(opt.value as typeof view)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === opt.value ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-zinc-400">
          <ChefHat className="w-12 h-12 mx-auto mb-3 text-zinc-200" />
          <p>Nenhum pedido em produção</p>
        </div>
      ) : view === "por-produto" ? (
        <div className="space-y-6">
          {/* Lista de produção consolidada */}
          <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-50 bg-zinc-50">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
                <Package className="w-4 h-4" /> Lista de produção ({orders.length} pedido{orders.length !== 1 ? "s" : ""})
              </h2>
            </div>
            <div className="divide-y divide-zinc-50">
              {productionList.map((item) => (
                <div key={item.name} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-orange-700">{item.totalQty}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-zinc-900">{item.name}</p>
                    <p className="text-xs text-zinc-400">
                      Pedidos: {item.orders.map(o => `#${o.number}(${o.qty})`).join(", ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pedidos em produção */}
          {inProduction.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Em produção</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {inProduction.map(order => <OrderCard key={order.id} order={order} />)}
              </div>
            </div>
          )}

          {/* Pedidos confirmados */}
          {confirmed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Aguardando iniciar</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {confirmed.map(order => <OrderCard key={order.id} order={order} />)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...inProduction, ...confirmed].map(order => <OrderCard key={order.id} order={order} />)}
        </div>
      )}
    </div>
  );
}
