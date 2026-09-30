import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function GET(_req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const unitId = auth.unit.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const baseWhere = { unitId };

  const [
    totalOrders,
    totalRevenue,
    pendingOrders,
    ordersToday,
    revenueToday,
    activeCustomers,
    topProductsRaw,
  ] = await Promise.all([
    prisma.order.count({ where: { ...baseWhere, status: { not: "CANCELLED" } } }),

    prisma.order.aggregate({
      where: { ...baseWhere, status: { not: "CANCELLED" } },
      _sum: { total: true },
    }),

    prisma.order.count({
      where: { ...baseWhere, status: { in: ["PENDING", "CONFIRMED", "IN_PRODUCTION"] } },
    }),

    prisma.order.count({
      where: { ...baseWhere, createdAt: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } },
    }),

    prisma.order.aggregate({
      where: { ...baseWhere, createdAt: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } },
      _sum: { total: true },
    }),

    prisma.customer.count({
      where: {
        unitId,
        lastOrderAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
    }),

    prisma.orderItem.groupBy({
      by: ["name"],
      where: {
        order: {
          ...baseWhere,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          status: { not: "CANCELLED" },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
  ]);

  const totalRev = totalRevenue._sum.total ?? 0;
  const avgTicket = totalOrders > 0 ? totalRev / totalOrders : 0;

  return NextResponse.json({
    totalOrders,
    totalRevenue: totalRev,
    pendingOrders,
    activeCustomers,
    ordersToday,
    revenueToday: revenueToday._sum.total ?? 0,
    avgTicket,
    topProducts: topProductsRaw.map((p) => ({ name: p.name, count: p._sum.quantity ?? 0 })),
  });
}
