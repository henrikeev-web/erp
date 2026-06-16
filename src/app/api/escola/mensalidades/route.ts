import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user.role === "ADMIN" ? session : null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const status = searchParams.get("status");

  const where: any = {};
  if (month) where.referenceMonth = parseInt(month);
  if (year) where.referenceYear = parseInt(year);
  if (status) where.status = status;

  const invoices = await (prisma.monthlyInvoice as any).findMany({
    where,
    orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
    include: {
      schoolParent: { select: { id: true, name: true, cpf: true, email: true, phone: true, schoolName: true, childName: true } },
    },
  });

  return NextResponse.json(invoices);
}
