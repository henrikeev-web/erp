import { prisma } from "@/lib/prisma";
import { getCurrentUnit } from "@/lib/unit";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, ShoppingBag, Users, Package } from "lucide-react";
import { RevenueAreaChart } from "@/components/admin/DashboardCharts";
import type { DayRevenue } from "@/components/admin/DashboardCharts";

async function getReports(unitId: string) {
  const now = new Date();
  const startOf30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOf7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

  const [
    rev30, rev7, revMonth,
    orders30, ordersMonth,
    newCustomers30,
    topProducts,
    byPayment,
    byStatus,
    weeklyOrders,
  ] = await Promise.all([
    prisma.order.aggregate({ where: { unitId, createdAt: { gte: startOf30 }, status: { not: "CANCELLED" } }, _sum: { total: true }, _count: true }),
    prisma.order.aggregate({ where: { unitId, createdAt: { gte: startOf7 }, status: { not: "CANCELLED" } }, _sum: { total: true }, _count: true }),
    prisma.order.aggregate({ where: { unitId, createdAt: { gte: startOfMonth }, status: { not: "CANCELLED" } }, _sum: { total: true }, _count: true }),
    prisma.order.count({ where: { unitId, createdAt: { gte: startOf30 }, status: { not: "CANCELLED" } } }),
    prisma.order.count({ where: { unitId, createdAt: { gte: startOfMonth }, status: { not: "CANCELLED" } } }),
    prisma.customer.count({ where: { unitId, createdAt: { gte: startOf30 } } }),
    prisma.orderItem.groupBy({
      by: ["name"],
      where: { order: { unitId, createdAt: { gte: startOf30 }, status: { not: "CANCELLED" } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 10,
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: { order: { unitId }, createdAt: { gte: startOf30 }, status: "PAID" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { unitId, createdAt: { gte: startOf30 } },
      _count: true,
    }),
    // findMany instead of $queryRaw to avoid BigInt serialization issues
    prisma.order.findMany({
      where: { unitId, createdAt: { gte: startOf7 }, status: { not: "CANCELLED" } },
      select: { total: true, createdAt: true },
    }),
  ]);

  // Build 7-day daily buckets (server-side, safe for RSC)
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
  const dailyChart: DayRevenue[] = Object.entries(dayMap).map(([day, v]) => ({ day, ...v }));

  return {
    rev30: rev30._sum.total ?? 0,
    rev7: rev7._sum.total ?? 0,
    revMonth: revMonth._sum.total ?? 0,
    avgTicket30: orders30 > 0 ? (rev30._sum.total ?? 0) / orders30 : 0,
    orders30,
    ordersMonth,
    newCustomers30,
    topProducts,
    byPayment,
    byStatus,
    dailyChart,
  };
}

export default async function RelatoriosPage() {
  const unit = await getCurrentUnit();
  if (!unit) return <div className="p-8">Unidade não encontrada</div>;
  const data = await getReports(unit.id);

  const STATUS_LABELS: Record<string, string> = {
    PENDING: "Aguardando", CONFIRMED: "Confirmado", IN_PRODUCTION: "Produção",
    READY: "Pronto", DISPATCHED: "Enviado", DELIVERED: "Entregue", CANCELLED: "Cancelado",
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Relatórios</h1>
        <p className="text-zinc-500 text-sm">Análise financeira e operacional</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Receita 30 dias", value: formatCurrency(data.rev30), icon: TrendingUp, color: "text-green-500", bg: "bg-green-50" },
          { label: "Receita este mês", value: formatCurrency(data.revMonth), icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "Pedidos 30 dias", value: data.orders30, icon: ShoppingBag, color: "text-orange-500", bg: "bg-orange-50" },
          { label: "Ticket médio 30d", value: formatCurrency(data.avgTicket30), icon: Package, color: "text-purple-500", bg: "bg-purple-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4 px-5">
              <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-xl font-bold text-zinc-900">{value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico de receita 7 dias */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Receita — últimos 7 dias</CardTitle>
            <div className="text-right">
              <p className="text-sm font-bold text-green-600">{formatCurrency(data.rev7)}</p>
              <p className="text-xs text-zinc-400">total no período</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <RevenueAreaChart data={data.dailyChart} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Produtos mais vendidos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Produtos — 30 dias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProducts.length === 0 ? (
              <p className="text-sm text-zinc-400">Sem dados</p>
            ) : (
              data.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p>
                    <div className="mt-1 bg-zinc-100 rounded-full h-1.5">
                      <div
                        className="bg-orange-400 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, ((p._sum?.total ?? 0) / (data.topProducts[0]._sum?.total ?? 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-zinc-900">{formatCurrency(p._sum?.total ?? 0)}</p>
                    <p className="text-xs text-zinc-400">{p._sum?.quantity ?? 0}un</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Por pagamento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Por forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.byPayment.map((p) => {
              const METHODS: Record<string, string> = {
                CASH: "💵 Dinheiro", PIX: "💸 PIX", CREDIT_CARD: "💳 Crédito",
                DEBIT_CARD: "💳 Débito", VOUCHER: "🎟 Vale",
              };
              return (
                <div key={p.method} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">{METHODS[p.method] ?? p.method}</span>
                  <div className="text-right">
                    <span className="font-bold text-zinc-900">{formatCurrency(p._sum?.amount ?? 0)}</span>
                    <span className="text-zinc-400 text-xs ml-2">({p._count}x)</span>
                  </div>
                </div>
              );
            })}
            {data.byPayment.length === 0 && <p className="text-sm text-zinc-400">Sem dados</p>}
          </CardContent>
        </Card>

        {/* Status dos pedidos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status dos pedidos — 30 dias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.byStatus.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700">{STATUS_LABELS[s.status] ?? s.status}</span>
                <span className="font-bold text-zinc-900">{s._count}</span>
              </div>
            ))}
            {data.byStatus.length === 0 && <p className="text-sm text-zinc-400">Sem dados</p>}
          </CardContent>
        </Card>

        {/* Novos clientes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CRM Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Novos clientes (30d)</span>
              <span className="font-bold text-blue-600">+{data.newCustomers30}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Pedidos este mês</span>
              <span className="font-bold text-zinc-900">{data.ordersMonth}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Receita 7 dias</span>
              <span className="font-bold text-green-600">{formatCurrency(data.rev7)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
