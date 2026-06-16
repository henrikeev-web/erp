"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import axios from "axios";
import { formatCurrency, orderStatusLabel, paymentMethodLabel } from "@/lib/utils";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  product: { images: { url: string }[] };
}

interface Order {
  id: string;
  number: number;
  status: string;
  type: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  createdAt: string;
  items: OrderItem[];
  payment: { method: string; status: string } | null;
  address: { label: string; street: string; number: string; neighborhood: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#f59e0b",
  CONFIRMED: "#3b82f6",
  IN_PRODUCTION: "#8b5cf6",
  READY: "#06b6d4",
  DISPATCHED: "#F26C21",
  DELIVERED: "#22c55e",
  CANCELLED: "#ef4444",
};

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    axios.get("/api/minha-conta/pedidos").then(({ data }) => setOrders(data)).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#F26C21" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", margin: 0 }}>Meus Pedidos</h1>

      {orders.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
          <ShoppingBag size={36} style={{ color: "#e8dcc8", margin: "0 auto 12px" }} />
          <p style={{ color: "#a8a29e", margin: 0, fontSize: 14 }}>Nenhum pedido encontrado.</p>
          <p style={{ color: "#c4b8a8", margin: "4px 0 0", fontSize: 13 }}>Seus pedidos aparecerão aqui após sua primeira compra.</p>
        </div>
      ) : (
        orders.map((order) => {
          const isOpen = expanded === order.id;
          const statusColor = STATUS_COLOR[order.status] ?? "#a8a29e";
          const date = new Date(order.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

          return (
            <div key={order.id} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
              {/* Header */}
              <button
                onClick={() => setExpanded(isOpen ? null : order.id)}
                style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1c1917" }}>Pedido #{order.number}</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: `${statusColor}18`,
                      color: statusColor,
                    }}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#a8a29e" }}>
                    {date} · {order.items.length} {order.items.length === 1 ? "item" : "itens"} · {formatCurrency(order.total)}
                  </p>
                </div>
                {isOpen ? <ChevronUp size={16} color="#a8a29e" /> : <ChevronDown size={16} color="#a8a29e" />}
              </button>

              {/* Details */}
              {isOpen && (
                <div style={{ borderTop: "1px solid #f5f0e8", padding: "12px 16px 16px" }}>
                  {/* Items */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {order.items.map((item) => (
                      <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {item.product.images[0] ? (
                          <img src={item.product.images[0].url} alt={item.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f5f0e8", flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, color: "#1c1917", fontWeight: 500 }}>{item.name}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#a8a29e" }}>{item.quantity}x {formatCurrency(item.price)}</p>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#57534e" }}>{formatCurrency(item.total)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div style={{ borderTop: "1px solid #f5f0e8", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#78716c" }}>
                      <span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span>
                    </div>
                    {order.deliveryFee > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#78716c" }}>
                        <span>Entrega</span><span>{formatCurrency(order.deliveryFee)}</span>
                      </div>
                    )}
                    {order.discount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#22c55e" }}>
                        <span>Desconto</span><span>-{formatCurrency(order.discount)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#1c1917", marginTop: 4 }}>
                      <span>Total</span><span>{formatCurrency(order.total)}</span>
                    </div>
                  </div>

                  {/* Payment & Address */}
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {order.payment && (
                      <span style={{ fontSize: 12, background: "#f5f0e8", color: "#78716c", padding: "4px 10px", borderRadius: 20 }}>
                        {paymentMethodLabel(order.payment.method)}
                      </span>
                    )}
                    {order.address && (
                      <span style={{ fontSize: 12, background: "#f5f0e8", color: "#78716c", padding: "4px 10px", borderRadius: 20 }}>
                        {order.address.street}, {order.address.number} — {order.address.neighborhood}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
