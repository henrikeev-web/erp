import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { emitirNfse } from "@/lib/nfse";

export const runtime = "nodejs";
export const maxDuration = 120;

// Módulo Escola/NFS-e é exclusivo da matriz (certificado A1 e CNPJ são dela)
async function requireAdmin() {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  return auth instanceof Response || auth.unit.type !== "HQ" ? null : auth;
}

const MONTH_NAMES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const invoice = await (prisma.monthlyInvoice as any).findUnique({
    where: { id },
    include: { schoolParent: true },
  });

  if (!invoice) return NextResponse.json({ error: "Mensalidade não encontrada" }, { status: 404 });
  if (invoice.status === "ISSUED") return NextResponse.json({ error: "NFS-e já emitida" }, { status: 409 });

  // Atomically get next RPS number
  const seq = await prisma.$transaction(async (tx) => {
    const row = await (tx.nfseSequence as any).upsert({
      where: { id: "rps_counter" },
      update: { current: { increment: 1 } },
      create: { id: "rps_counter", current: 1 },
    });
    return row;
  });

  const rpsNumber = seq.current;
  const parent = invoice.schoolParent;
  const monthName = MONTH_NAMES[invoice.referenceMonth];
  const discriminacao = `Fornecimento de refeições escolares — ${parent.childName ?? parent.name} — ${monthName}/${invoice.referenceYear}`;

  // Set competence to first day of the reference month
  const competenceDate = new Date(invoice.referenceYear, invoice.referenceMonth - 1, 1);

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
      where: { id },
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
  } else {
    await (prisma.monthlyInvoice as any).update({
      where: { id },
      data: { status: "ERROR", rpsNumber, nfseError: result.error ?? "Erro desconhecido" },
    });
  }

  return NextResponse.json(result);
}
