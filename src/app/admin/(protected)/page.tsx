import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { ShoppingBag, Users, TrendingUp, Clock, Package, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import OrderStatusBadge from "@/components/admin/OrderStatusBadge";
import { RevenueAreaChart, OrdersBarChart } from "@/components/admin/DashboardCharts";
import type { DayRevenue, StatusCount } from "@/components/admin/DashboardCharts";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando",
  CONFIRMED: "Confirmado",
  IN_PRODUCTION: "Produção",
  READY: "Pronto",
  DISPATCHED: "Enviado",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  CONFIRMED: "#3b82f6",
  IN_PRODUCTION: "#8b5cf6",
  READY: "#10b981",
  DISPATCHED: "#06b6d4",
  DELIVERED: "#22c55e",
  CANCELLED: "#ef4444",
};

async function getDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    pendingOrders,
    recentOrders,
    totalRevenue,
    ordersToday,
    revenueToday,
    activeCustomers,
    lowStock,
    topProducts,
    weeklyOrders,
    byStatus30,
  ] = await Promise.all([
    prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "IN_PRODUCTION"] } } }),

    prisma.order.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED", "IN_PRODUCTION", "READY"] } },
      include: {
        customer: { select: { name: true, phone: true } },
        items: { select: { name: true, quantity: true } },
        payment: { select: { method: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),

    prisma.order.aggregate({
      where: { createdAt: { gte: thirtyDaysAgo }, status: { not: "CANCELLED" } },
      _sum: { total: true },
    }),

    prisma.order.count({
      where: { createdAt: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } },
    }),

    prisma.order.aggregate({
      where: { createdAt: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } },
      _sum: { total: true },
    }),

    prisma.customer.count({
      where: { lastOrderAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    }),

    prisma.stockItem.findMany({
      where: { quantity: { lte: prisma.stockItem.fields.minQuantity } },
      include: { product: { select: { name: true } } },
      take: 5,
    }).catch(() => []),

    prisma.orderItem.groupBy({
      by: ["name"],
      where: { order: { createdAt: { gte: thirtyDaysAgo }, status: { not: "CANCELLED" } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),

    prisma.order.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, status: { not: "CANCELLED" } },
      select: { total: true, createdAt: true },
    }),

    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: true,
    }),
  ]);

  // Build daily revenue buckets for the last 7 days
  const dayMap: Record<string, { revenue: number; orders: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    dayMap[key] = { revenue: 0, orders: 0 };
  }
  for (const o of weeklyOrders) {
    const d = o.createdAt;
    const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (dayMap[key]) {
      dayMap[key].revenue += o.total;
      dayMap[key].orders += 1;
    }
  }
  const dailyRevenue: DayRevenue[] = Object.entries(dayMap).map(([day, v]) => ({ day, ...v }));

  const statusData: StatusCount[] = byStatus30.map((s) => ({
    name: STATUS_LABELS[s.status] ?? s.status,
    count: s._count,
    color: STATUS_COLORS[s.status] ?? "#f97316",
  }));

  return {
    pendingOrders,
    recentOrders,
    totalRevenue: totalRevenue._sum.total ?? 0,
    ordersToday,
    revenueToday: revenueToday._sum.total ?? 0,
    activeCustomers,
    lowStock,
    topProducts,
    dailyRevenue,
    statusData,
  };
}

export default async function AdminDashboard() {
  const data = await getDashboard();

  const stats = [
    { label: "Pedidos pendentes", value: data.pendingOrders, icon: Clock, href: "/admin/pedidos?status=PENDING" },
    { label: "Pedidos hoje", value: data.ordersToday, icon: ShoppingBag, href: "/admin/pedidos" },
    { label: "Faturamento hoje", value: formatCurrency(data.revenueToday), icon: TrendingUp, href: "/admin/relatorios" },
    { label: "Clientes ativos", value: data.activeCustomers, icon: Users, href: "/admin/clientes" },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">Visão geral do negócio</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-zinc-200">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-orange-500" />
                </div>
                <p className="text-2xl font-bold text-zinc-900">{value}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Revenue chart — full width */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Receita — últimos 7 dias</CardTitle>
            <div className="text-right">
              <p className="text-sm font-bold text-zinc-900">{formatCurrency(data.totalRevenue)}</p>
              <p className="text-xs text-zinc-400">últimos 30 dias</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <RevenueAreaChart data={data.dailyRevenue} />
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Pedidos ativos */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pedidos em andamento</CardTitle>
                <Link href="/admin/pedidos" className="text-xs text-orange-500 hover:underline">Ver todos</Link>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {data.recentOrders.length === 0 ? (
                <p className="text-sm text-zinc-400 px-6 py-4">Nenhum pedido ativo</p>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {data.recentOrders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/admin/pedidos/${order.id}`}
                      className="flex items-center gap-3 px-6 py-3 hover:bg-zinc-50 transition-colors"
                    >
                      <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-orange-700">#{order.number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">{order.customer.name}</p>
                        <p className="text-xs text-zinc-400 truncate">
                          {order.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <OrderStatusBadge status={order.status} />
                        <p className="text-xs text-zinc-400 mt-0.5">{formatCurrency(order.total)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          {/* Top produtos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-orange-500" /> Mais vendidos (30d)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.topProducts.length === 0 ? (
                <p className="text-xs text-zinc-400">Sem dados ainda</p>
              ) : (
                data.topProducts.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2 text-sm">
                    <span className="w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-zinc-700 truncate">{p.name}</span>
                    <span className="text-zinc-500 text-xs font-medium">{p._sum?.quantity ?? 0}un</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Status dos pedidos 30d */}
          {data.statusData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4 text-zinc-400" /> Status — 30 dias
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <OrdersBarChart data={data.statusData} />
              </CardContent>
            </Card>
          )}

          {/* Estoque baixo */}
          {data.lowStock.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                  <Package className="w-4 h-4" /> Estoque baixo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {data.lowStock.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-amber-800 truncate">{item.product.name}</span>
                    <span className="text-amber-600 font-medium ml-2">{item.quantity}un</span>
                  </div>
                ))}
                <Link href="/admin/estoque" className="text-xs text-amber-600 hover:underline block mt-2">
                  Gerenciar estoque →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
