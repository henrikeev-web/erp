import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emitirNfse } from "@/lib/nfse";

export const runtime = "nodejs";
export const maxDuration = 300;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user.role === "ADMIN" ? session : null;
}

const MONTH_NAMES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { month, year } = await req.json();
  if (!month || !year) return NextResponse.json({ error: "month e year são obrigatórios" }, { status: 400 });

  const m = parseInt(month);
  const y = parseInt(year);

  const pending = await (prisma.monthlyInvoice as any).findMany({
    where: { referenceMonth: m, referenceYear: y, status: { in: ["PENDING", "ERROR"] } },
    include: { schoolParent: true },
  });

  let issued = 0;
  let errors = 0;
  const results: any[] = [];

  for (const invoice of pending) {
    const seq = await prisma.$transaction(async (tx) => {
      return (tx.nfseSequence as any).upsert({
        where: { id: "rps_counter" },
        update: { current: { increment: 1 } },
        create: { id: "rps_counter", current: 1 },
      });
    });

    const rpsNumber = seq.current;
    const parent = invoice.schoolParent;
    const monthName = MONTH_NAMES[m];
    const discriminacao = `Fornecimento de refeições escolares — ${parent.childName ?? parent.name} — ${monthName}/${y}`;
    const competenceDate = new Date(y, m - 1, 1);

    const result = await emitirNfse({
      rpsNumber,
      emissionDate: new Date(),
      competenceDate,
      amount: invoice.amount,
      discriminacao,
      tomadorName: parent.name,
      tomadorCpf: parent.cpf ?? undefined,
      tomadorEmail: parent.email ?? undefined,
      tomadorPhone: parent.phone ?? undefined,
    });

    if (result.success) {
      await (prisma.monthlyInvoice as any).update({
        where: { id: invoice.id },
        data: {
          status: "ISSUED",
          rpsNumber,
          nfseNumber: result.nfseNumber,
          nfseVerifyCode: result.verifyCode ?? null,
          nfseLink: result.link ?? null,
          nfseXml: result.xml ?? null,
          nfseIssuedAt: new Date(),
          nfseError: null,
        },
      });
      issued++;
    } else {
      await (prisma.monthlyInvoice as any).update({
        where: { id: invoice.id },
        data: { status: "ERROR", rpsNumber, nfseError: result.error ?? "Erro" },
      });
      errors++;
    }

    results.push({ parentName: parent.name, ...result });
  }

  return NextResponse.json({ processed: pending.length, issued, errors, results });
}
