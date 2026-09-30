import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { brDate } from "@/lib/courier";
import { buildCourierReports } from "@/lib/courier-report";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Tudo que vem de cadastro/cliente é escapado: o HTML é aberto no navegador do operador
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtDay = (d: string) => d.split("-").reverse().join("/");

// Relatório IMPRIMÍVEL para entregar ao entregador (ADMIN). Sem dados do cliente: só nº, dia/hora, região e valor.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const today = brDate(new Date());
  const de = sp.get("de") ?? today;
  const ate = sp.get("ate") ?? today;

  let reports;
  try { reports = await buildCourierReports(auth.unit.id, de, ate, id); }
  catch { return new NextResponse("Período inválido", { status: 400 }); }

  const courier = await prisma.courier.findFirst({ where: { id, unitId: auth.unit.id }, select: { name: true, pixKey: true } });
  if (!courier) return new NextResponse("Entregador não encontrado", { status: 404 });
  const rep = reports[0];

  const byDay = new Map<string, typeof rep.deliveries>();
  for (const d of rep?.deliveries ?? []) byDay.set(d.day, [...(byDay.get(d.day) ?? []), d]);

  const body = [...byDay.entries()].map(([day, list]) => `
    <h3>${esc(fmtDay(day))}</h3>
    <table>
      <thead><tr><th>Pedido</th><th>Hora</th><th>Região</th><th>Bairro</th><th class="r">Valor</th></tr></thead>
      <tbody>${list.map((d) => `<tr><td>#${d.number}</td><td>${esc(d.time)}</td><td>${esc(d.zone ?? "—")}</td><td>${esc(d.neighborhood ?? "—")}</td><td class="r">${formatCurrency(d.courierFee)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="4">Subtotal do dia (${list.length} ${list.length === 1 ? "entrega" : "entregas"})</td><td class="r">${formatCurrency(list.reduce((s, d) => s + d.courierFee, 0))}</td></tr></tfoot>
    </table>`).join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de entregas — ${esc(courier.name)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,sans-serif;font-size:13px;color:#222;max-width:760px;margin:24px auto;padding:0 16px}
  h1{font-size:20px;margin:0} h2{font-size:14px;color:#555;margin:2px 0 14px;font-weight:normal} h3{font-size:14px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse} th{background:#f3f3f3;text-align:left;padding:6px;font-size:11px;text-transform:uppercase;border-bottom:1px solid #ccc}
  td{padding:6px;border-bottom:1px solid #eee} tfoot td{font-weight:bold;border-top:1px solid #999;border-bottom:none} .r{text-align:right}
  .total{margin-top:22px;padding:12px 14px;border:2px solid #222;display:flex;justify-content:space-between;font-size:17px;font-weight:bold}
  .sign{margin-top:46px;display:flex;gap:40px} .sign div{flex:1;border-top:1px solid #222;padding-top:4px;text-align:center;font-size:12px}
  .muted{color:#777;font-size:12px} @media print{body{margin:0}}
</style></head><body>
  <h1>🍼 BANGUELAS — Relatório de entregas</h1>
  <h2>${esc(courier.name)} · ${esc(fmtDay(de))}${de !== ate ? ` a ${esc(fmtDay(ate))}` : ""}</h2>
  ${rep ? body : '<p class="muted">Nenhuma entrega no período.</p>'}
  <div class="total"><span>TOTAL A RECEBER (${rep?.totals.count ?? 0} ${(rep?.totals.count ?? 0) === 1 ? "entrega" : "entregas"})</span><span>${formatCurrency(rep?.totals.total ?? 0)}</span></div>
  ${courier.pixKey ? `<p class="muted">Chave PIX cadastrada: ${esc(courier.pixKey)}</p>` : ""}
  <div class="sign"><div>Entregador — ${esc(courier.name)}</div><div>Responsável</div></div>
  <p class="muted">Emitido em ${new Date().toLocaleString("pt-BR", { timeZone: process.env.BUSINESS_TZ ?? "America/Sao_Paulo" })}</p>
  <script>window.onload=function(){window.print()}</script>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
