import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { getCertStatus } from "@/lib/nfse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Módulo Escola/NFS-e é exclusivo da matriz (certificado A1 e CNPJ são dela)
async function requireAdmin() {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  return auth instanceof Response || auth.unit.type !== "HQ" ? null : auth;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const config = await (prisma.nfseConfig as any).findUnique({ where: { id: "singleton" } });
  const cert = getCertStatus();

  return NextResponse.json({ config: config ?? null, cert });
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();

  const data: any = {
    cnpj:          (body.cnpj         ?? "").replace(/\D/g, ""),
    im:            body.im            ?? "",
    razaoSocial:   body.razaoSocial   ?? "",
    itemServico:   body.itemServico   ?? "14.01",
    codTributacao: body.codTributacao ?? "",
    aliquotaIss:   parseFloat(body.aliquotaIss ?? "0.02"),
    ambiente:      body.ambiente      ?? "homologacao",
    wsUrl:         body.wsUrl         ?? "https://ws-sjrp.giss.com.br/service-ws/nf/nfse-ws",
    wsHomologUrl:  body.wsHomologUrl  ?? "https://ws-ficticio.giss.com.br/service-ws/nf/nfse-ws",
  };

  const config = await (prisma.nfseConfig as any).upsert({
    where:  { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  return NextResponse.json(config);
}
