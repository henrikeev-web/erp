import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user.role === "ADMIN" ? session : null;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { month, year } = await req.json();
  if (!month || !year) return NextResponse.json({ error: "month e year são obrigatórios" }, { status: 400 });

  const m = parseInt(month);
  const y = parseInt(year);

  const parents = await (prisma.schoolParent as any).findMany({ where: { active: true } });

  let created = 0;
  let skipped = 0;

  for (const parent of parents) {
    try {
      const dueDate = new Date(y, m - 1, parent.dueDay);
      await (prisma.monthlyInvoice as any).create({
        data: {
          schoolParentId: parent.id,
          referenceMonth: m,
          referenceYear: y,
          amount: parent.monthlyFee,
          dueDate,
          status: "PENDING",
        },
      });
      created++;
    } catch (e: any) {
      // unique constraint: invoice already exists for this parent/month/year
      if (e.code === "P2002") {
        skipped++;
      } else {
        throw e;
      }
    }
  }

  return NextResponse.json({ created, skipped, total: parents.length });
}
