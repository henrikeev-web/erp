"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Minus, Plus, RotateCcw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { brl, errMsg, fmtDate } from "@/components/admin/financeiro/shared";
import { orderStatusLabel } from "@/lib/utils";
import { RESELLER_INVOICE_DAYS } from "@/lib/invoice-terms";

interface CatalogItem { id: string; name: string; description: string | null; category: string | null; imageUrl: string | null; unitPrice: number; stock: number | null; soldOut: boolean; myStock: number | null; isNew: boolean }
interface OrderRow { id: string; number: number; status: string; total: number; notes: string | null; createdAt: string; deliveredAt: string | null; restockedAt: string | null; invoiceDays: number | null; payment: { method: string; status: string } | null; items: { productId: string; name: string; quantity: number; price: number; total: number }[] }
interface Novidades { lancamentos: { id: string; name: string; description: string | null; createdAt: string; imageUrl: string | null; unitPrice: number }[]; maisPedidos: { productId: string; name: string; imageUrl: string | null; franquias: number; quantidade: number }[] }

type Tab = "novo" | "pedidos" | "novidades";

export default function ReposicaoClient() {
  const [tab, setTab] = useState<Tab>("novo");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [news, setNews] = useState<Novidades | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<"INVOICE" | "PIX">("INVOICE");
  const [days, setDays] = useState<number>(RESELLER_INVOICE_DAYS[1]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [v, setV] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([axios.get("/api/reposicao/catalogo"), axios.get("/api/reposicao/pedidos"), axios.get("/api/reposicao/novidades")])
      .then(([c, o, n]) => { if (!alive) return; setCatalog(c.data); setOrders(o.data); setNews(n.data); })
      .catch((e) => alive && setError(errMsg(e, "Erro ao carregar")));
    return () => { alive = false; };
  }, [v]);

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const lines = useMemo(() => catalog.filter((c) => (qty[c.id] ?? 0) > 0).map((c) => ({ c, n: qty[c.id] })), [catalog, qty]);
  const total = Math.round(lines.reduce((s, l) => s + l.c.unitPrice * l.n, 0) * 100) / 100;
  const setN = (c: CatalogItem, n: number) => setQty((s) => ({ ...s, [c.id]: Math.max(0, Math.min(n, c.stock ?? 10_000)) }));

  const filtered = useMemo(() => { const t = q.trim().toLowerCase(); return t ? catalog.filter((c) => c.name.toLowerCase().includes(t)) : catalog; }, [catalog, q]);
  const grouped = useMemo(() => { const g = new Map<string, CatalogItem[]>(); for (const c of filtered) g.set(c.category ?? "Outros", [...(g.get(c.category ?? "Outros") ?? []), c]); return [...g]; }, [filtered]);

  const repeat = useCallback((o: OrderRow) => {
    const next: Record<string, number> = {}; const skipped: string[] = [];
    for (const i of o.items) {
      const c = byId.get(i.productId);
      if (!c || c.soldOut) { skipped.push(i.name); continue; }
      next[c.id] = Math.min(i.quantity, c.stock ?? i.quantity);
    }
    setQty(next); setTab("novo"); setError("");
    setInfo(`Pedido #${o.number} carregado no carrinho.${skipped.length ? ` Sem estoque na matriz, ficou de fora: ${skipped.join(", ")}.` : ""} Confira as quantidades e os preços atuais.`);
  }, [byId]);

  async function submit() {
    setError(""); setInfo("");
    if (lines.length === 0) return setError("Adicione ao menos um produto");
    setSaving(true);
    try {
      const { data } = await axios.post("/api/reposicao/pedidos", { items: lines.map((l) => ({ productId: l.c.id, quantity: l.n })), paymentMethod: method, invoiceDays: method === "INVOICE" ? days : undefined, notes: notes || undefined });
      setQty({}); setNotes(""); setInfo(`Pedido #${data.number} enviado à matriz (${brl(data.total)}). Acompanhe em "Meus pedidos".`); setTab("pedidos"); setV((x) => x + 1);
    } catch (e) { setError(errMsg(e, "Erro ao enviar o pedido")); } finally { setSaving(false); }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Pedidos à matriz</h1>
        <p className="text-zinc-500 text-sm">Reposição de estoque com o preço de franqueado. Quando a matriz entrega, o estoque da sua franquia é atualizado sozinho.</p>
      </div>
      <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
        {([["novo", `Novo pedido${lines.length ? ` (${lines.length})` : ""}`], ["pedidos", "Meus pedidos"], ["novidades", "Lançamentos e mais pedidos"]] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>{l}</button>
        ))}
      </div>
      {info && <div className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">{info}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      {tab === "novo" && (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto…" className="pl-9" /></div>
            <div className="bg-white rounded-2xl border border-zinc-100 divide-y divide-zinc-50">
              {catalog.length === 0 && <p className="text-center py-10 text-zinc-400 text-sm">Carregando catálogo…</p>}
              {grouped.map(([cat, list]) => (
                <Fragment key={cat}>
                  <div className="px-4 py-2 bg-zinc-50 text-xs font-semibold text-zinc-500 uppercase tracking-wide">{cat}</div>
                  {list.map((c) => {
                    const n = qty[c.id] ?? 0;
                    return (
                      <div key={c.id} className={`flex items-center gap-3 px-4 py-2.5 ${c.soldOut ? "opacity-50" : ""}`}>
                        {c.imageUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover" /> : <div className="w-11 h-11 rounded-lg bg-zinc-100" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">{c.name}{c.isNew && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">NOVO</span>}</p>
                          <p className="text-xs text-zinc-500">{brl(c.unitPrice)} · matriz: {c.soldOut ? <strong className="text-red-600">sem estoque</strong> : c.stock === null ? "disponível" : `${c.stock} un.`} · seu estoque: {c.myStock ?? 0}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setN(c, n - 1)} disabled={n === 0 || c.soldOut} className="w-7 h-7 rounded-lg border border-zinc-200 flex items-center justify-center disabled:opacity-30" aria-label="Menos"><Minus className="w-3.5 h-3.5" /></button>
                          <input value={n || ""} onChange={(e) => setN(c, parseInt(e.target.value) || 0)} placeholder="0" inputMode="numeric" disabled={c.soldOut} className="w-14 h-7 text-center text-sm border border-zinc-200 rounded-lg" />
                          <button onClick={() => setN(c, n + 1)} disabled={c.soldOut || (c.stock !== null && n >= c.stock)} className="w-7 h-7 rounded-lg border border-zinc-200 flex items-center justify-center disabled:opacity-30" aria-label="Mais"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <aside className="lg:sticky lg:top-6 self-start bg-white rounded-2xl border border-zinc-100 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">Resumo do pedido</h2>
            {lines.length === 0 ? <p className="text-sm text-zinc-400">Nenhum item</p> : (
              <div className="space-y-1 max-h-56 overflow-y-auto">{lines.map((l) => <div key={l.c.id} className="flex justify-between text-sm gap-2"><span className="truncate">{l.n}× {l.c.name}</span><span className="shrink-0">{brl(l.c.unitPrice * l.n)}</span></div>)}</div>
            )}
            <div className="flex justify-between text-lg font-bold border-t border-zinc-100 pt-3"><span>Total</span><span>{brl(total)}</span></div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pagamento</p>
              <div className="grid grid-cols-2 gap-2">
                {([["INVOICE", "Faturado"], ["PIX", "PIX"]] as const).map(([m, l]) => <button key={m} onClick={() => setMethod(m)} className={`py-2 rounded-xl border text-sm font-medium ${method === m ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-600"}`}>{l}</button>)}
              </div>
              {method === "INVOICE" && (
                <div className="grid grid-cols-4 gap-1.5">{RESELLER_INVOICE_DAYS.map((d) => <button key={d} onClick={() => setDays(d)} className={`py-1.5 rounded-lg border text-xs font-medium ${days === d ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-600"}`}>{d} dias</button>)}</div>
              )}
              {method === "INVOICE" && <p className="text-[11px] text-zinc-500">O prazo conta a partir da data do pedido. Vira conta a receber na matriz.</p>}
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observações (opcional)" className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" />
            <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={submit} disabled={saving || lines.length === 0}>{saving ? "Enviando…" : "Enviar pedido à matriz"}</Button>
          </aside>
        </div>
      )}

      {tab === "pedidos" && (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100"><th className="px-4 py-3 font-medium">Pedido</th><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Situação</th><th className="px-4 py-3 font-medium">Pagamento</th><th className="px-4 py-3 font-medium text-right">Total</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {orders.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-zinc-400">Você ainda não fez pedidos à matriz</td></tr> : orders.map((o) => (
                <Fragment key={o.id}>
                  <tr className="border-b border-zinc-50 cursor-pointer hover:bg-zinc-50/60" onClick={() => setOpen((s) => ({ ...s, [o.id]: !s[o.id] }))}>
                    <td className="px-4 py-3 font-medium text-zinc-900">#{o.number}<span className="block text-xs font-normal text-zinc-500">{o.items.length} {o.items.length === 1 ? "produto" : "produtos"}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-700">{orderStatusLabel(o.status)}</span>{o.restockedAt && <span className="block text-[11px] text-emerald-700">estoque atualizado</span>}</td>
                    <td className="px-4 py-3 text-zinc-600">{o.payment?.method === "INVOICE" ? `Faturado ${o.invoiceDays}d` : "PIX"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(o.total)}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); repeat(o); }}><RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Repetir</Button></td>
                  </tr>
                  {open[o.id] && <tr className="bg-zinc-50/60"><td colSpan={6} className="px-6 py-3 text-xs text-zinc-600 space-y-0.5">{o.items.map((i) => <div key={i.productId} className="flex justify-between max-w-md"><span>{i.quantity}× {i.name}</span><span>{brl(i.total)}</span></div>)}{o.notes && <p className="text-zinc-400 pt-1">{o.notes}</p>}</td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "novidades" && news && (
        <div className="grid lg:grid-cols-2 gap-5">
          <section className="bg-white rounded-2xl border border-zinc-100 p-5">
            <h2 className="font-semibold text-zinc-900 mb-3">Lançamentos da matriz</h2>
            {news.lancamentos.length === 0 ? <p className="text-sm text-zinc-400">Sem lançamentos recentes</p> : (
              <div className="space-y-2.5">{news.lancamentos.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  {p.imageUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover" /> : <div className="w-11 h-11 rounded-lg bg-orange-50" />}
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p><p className="text-xs text-zinc-500">{brl(p.unitPrice)} · {fmtDate(p.createdAt)}</p></div>
                  <Button size="sm" variant="outline" onClick={() => { const c = byId.get(p.id); if (c && !c.soldOut) { setN(c, (qty[c.id] ?? 0) + 1); setTab("novo"); } }}>+ Pedido</Button>
                </div>
              ))}</div>
            )}
          </section>
          <section className="bg-white rounded-2xl border border-zinc-100 p-5">
            <h2 className="font-semibold text-zinc-900">Mais pedidos pelas outras franquias</h2>
            <p className="text-xs text-zinc-500 mb-3">Últimos 30 dias. As franquias não são identificadas.</p>
            {news.maisPedidos.length === 0 ? <p className="text-sm text-zinc-400">Ainda não há dados suficientes</p> : (
              <div className="space-y-2.5">{news.maisPedidos.map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="w-5 text-zinc-400 text-sm">{i + 1}</span>
                  {p.imageUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover" /> : <div className="w-11 h-11 rounded-lg bg-zinc-100" />}
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p><p className="text-xs text-zinc-500">{p.franquias} {p.franquias === 1 ? "franquia pediu" : "franquias pediram"}</p></div>
                  <Button size="sm" variant="outline" onClick={() => { const c = byId.get(p.productId); if (c && !c.soldOut) { setN(c, (qty[c.id] ?? 0) + 1); setTab("novo"); } }}>+ Pedido</Button>
                </div>
              ))}</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
