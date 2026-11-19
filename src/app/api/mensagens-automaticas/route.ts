/* eslint-disable @typescript-eslint/no-explicit-any -- client Prisma 7 sem tipos (ver CLAUDE.md) */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { evolutionConfigured, getAutoMessageConfig, MAX_MESSAGE_LEN } from "@/lib/order-messages";
import { orderNo } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Mensagem automática de WhatsApp por pedido (src/lib/order-messages.ts). Só administrador da matriz:
// o envio sai pelo número da loja na Evolution API.
async function payload(unitId: string) {
  const cfg = await getAutoMessageConfig(unitId);
  const recent = await (prisma as any).order.findMany({
    where: { unitId, autoMsgAt: { not: null } },
    orderBy: { autoMsgAt: "desc" },
    take: 15,
    select: { number: true, autoMsgAt: true, autoMsgStatus: true, total: true, deliveryFee: true, source: true, customer: { select: { name: true } } },
  });
  return {
    enabled: cfg.enabled,
    threshold: cfg.threshold,
    messageBelow: cfg.messageBelow,
    messageAbove: cfg.messageAbove,
    evolutionConfigured: evolutionConfigured(),
    recent: recent.map((o: any) => ({
      number: orderNo(o.number),
      customer: o.customer?.name ?? "",
      origin: o.source === "goomer" ? "Goomer" : "Loja",
      value: Math.round((o.total - (o.deliveryFee ?? 0)) * 100) / 100,
      at: o.autoMsgAt,
      status: o.autoMsgStatus ?? "ENVIANDO",
    })),
  };
}

export async function GET() {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await payload(auth.unit.id));
}

const schema = z.object({
  enabled: z.boolean(),
  threshold: z.number().min(0).max(100000),
  messageBelow: z.string().trim().min(1).max(MAX_MESSAGE_LEN),
  messageAbove: z.string().trim().min(1).max(MAX_MESSAGE_LEN),
});

export async function PUT(req: NextRequest) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Preencha as duas mensagens e um valor válido" }, { status: 400 });
  const d = parsed.data;
  await getAutoMessageConfig(auth.unit.id);
  await (prisma as any).autoMessageConfig.update({
    where: { unitId: auth.unit.id },
    data: { enabled: d.enabled, threshold: Math.round(d.threshold * 100) / 100, messageBelow: d.messageBelow, messageAbove: d.messageAbove, updatedBy: auth.userId },
  });
  console.info(`[auto-msg] configuração ${d.enabled ? "LIGADA" : "desligada"} (limite R$ ${d.threshold}) por ${auth.userId}`);
  return NextResponse.json(await payload(auth.unit.id));
}
