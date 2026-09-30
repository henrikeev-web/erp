"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { brl, errMsg, fmtDate, todayStr } from "@/components/admin/financeiro/shared";

interface UnitRow {
  id: string; name: string; slug: string; type: "HQ" | "FRANCHISE"; active: boolean; city: string | null; state: string | null;
  orders: number; sales: number; avgTicket: number; cancelled: number; cancelRate: number; salesChange: number | null; ordersChange: number | null;
  newCustomers: number; replenishment: number | null; lowStock: number;
  finance: { payableOpen: number; payableOverdue: number; receivableOpen: number; receivableOverdue: number };
}
interface Data {
  de: string; ate: string; days: number;
  totals: { sales: number; orders: number; avgTicket: number; salesChange: number | null; ordersChange: number | null; cancelRate: number; newCustomers: number; replenishment: number; activeFranchises: number };
  units: UnitRow[]; series: Record<string, number | string>[]; topProducts: { name: string; quantity: number; revenue: number }[];
}

const COLORS = ["#F26C21", "#2563eb", "#16a34a", "#9333ea", "#dc2626", "#0891b2", "#ca8a04", "#db2777"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const PRESETS = [
  { label: "7 dias", r: () => [daysAgo(6), todayStr()] },
  { label: "30 dias", r: () => [daysAgo(29), todayStr()] },
  { label: "Este mês", r: () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), todayStr()]; } },
  { label: "90 dias", r: () => [daysAgo(89), todayStr()] },
] as const;

function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-zinc-400">novo</span>;
  const up = v >= 0;
  return <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>{up ? "▲" : "▼"} {Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>;
}

export default function RedeClient() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"perf" | "fin">("perf");

  useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    axios.get("/api/rede/dashboard", { params: { de: from, ate: to } })
      .then(({ data }) => { if (alive) { setData(data); setError(""); } })
      .catch((e) => alive && setError(errMsg(e, "Erro ao carregar")));
    return () => { alive = false; };
  }, [from, to]);

  const colorOf = useMemo(() => new Map((data?.units ?? []).map((u, i) => [u.id, COLORS[i % COLORS.length]])), [data]);
  const maxSales = Math.max(1, ...(data?.units.map((u) => u.sales) ?? [1]));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard da rede</h1>
          <p className="text-zinc-500 text-sm">Desempenho de cada unidade, comparado ao período anterior. Vendas = pedidos de consumidores; a reposição das franquias aparece à parte.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="text-xs font-medium text-zinc-500 block mb-1">De</label><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10" /></div>
          <div><label className="text-xs font-medium text-zinc-500 block mb-1">até</label><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10" /></div>
          <div className="flex gap-1 pb-0.5">{PRESETS.map((p) => <button key={p.label} onClick={() => { const [a, b] = p.r(); setFrom(a); setTo(b); }} className="px-2.5 py-2 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200">{p.label}</button>)}</div>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      {!data ? <div className="text-center py-16 text-zinc-400">Carregando…</div> : (
        <>
          <p className="text-xs text-zinc-500">Período: {fmtDate(data.de)} a {fmtDate(data.ate)} ({data.days} dias) · {data.totals.activeFranchises} franquia{data.totals.activeFranchises !== 1 ? "s" : ""} ativa{data.totals.activeFranchises !== 1 ? "s" : ""}</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { t: "Faturamento da rede", v: brl(data.totals.sales), d: <Delta v={data.totals.salesChange} /> },
              { t: "Pedidos", v: String(data.totals.orders), d: <Delta v={data.totals.ordersChange} /> },
              { t: "Ticket médio", v: brl(data.totals.avgTicket) },
              { t: "Cancelamentos", v: `${data.totals.cancelRate.toLocaleString("pt-BR")}%` },
              { t: "Clientes novos", v: String(data.totals.newCustomers) },
              { t: "Reposição vendida às franquias", v: brl(data.totals.replenishment) },
            ].map((c) => (
              <div key={c.t} className="bg-white rounded-2xl border border-zinc-100 p-4"><p className="text-xs text-zinc-500">{c.t}</p><p className="text-xl font-bold text-zinc-900 mt-1">{c.v}</p><div className="mt-0.5 h-4">{c.d}</div></div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <p className="text-sm font-semibold text-zinc-700 mb-3">Vendas por dia, por unidade</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.series.map((r) => ({ ...r, label: String(r.day).slice(5).split("-").reverse().join("/") }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12 }} formatter={(v, n) => [brl(v as number), data.units.find((u) => u.id === n)?.name ?? n]} />
                <Legend formatter={(v) => data.units.find((u) => u.id === v)?.name ?? v} wrapperStyle={{ fontSize: 12 }} />
                {data.units.map((u) => <Line key={u.id} type="monotone" dataKey={u.id} stroke={colorOf.get(u.id)} strokeWidth={2} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
            {([["perf", "Desempenho"], ["fin", "Financeiro da rede"]] as const).map(([v, l]) => <button key={v} onClick={() => setTab(v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === v ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>{l}</button>)}
          </div>

          {tab === "perf" ? (
            <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100">
                  <th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Unidade</th><th className="px-4 py-3 font-medium min-w-44">Vendas</th>
                  <th className="px-4 py-3 font-medium text-right">vs. anterior</th><th className="px-4 py-3 font-medium text-right">Pedidos</th><th className="px-4 py-3 font-medium text-right">Ticket</th>
                  <th className="px-4 py-3 font-medium text-right">Cancel.</th><th className="px-4 py-3 font-medium text-right">Clientes novos</th><th className="px-4 py-3 font-medium text-right">Reposição</th><th className="px-4 py-3 font-medium text-right">Estoque baixo</th>
                </tr></thead>
                <tbody>
                  {data.units.map((u, i) => (
                    <tr key={u.id} className={`border-b border-zinc-50 last:border-0 ${u.active ? "" : "opacity-50"}`}>
                      <td className="px-4 py-3 text-zinc-400">{i + 1}</td>
                      <td className="px-4 py-3"><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: colorOf.get(u.id) }} /><span className="font-medium text-zinc-900">{u.name}</span>{u.type === "HQ" && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-semibold">matriz</span>}{!u.active && <span className="ml-1.5 text-[10px] text-zinc-500">(inativa)</span>}</td>
                      <td className="px-4 py-3"><div className="font-semibold">{brl(u.sales)}</div><div className="h-1.5 bg-zinc-100 rounded-full mt-1"><div className="h-1.5 rounded-full" style={{ width: `${(u.sales / maxSales) * 100}%`, background: colorOf.get(u.id) }} /></div></td>
                      <td className="px-4 py-3 text-right"><Delta v={u.salesChange} /></td>
                      <td className="px-4 py-3 text-right">{u.orders}</td>
                      <td className="px-4 py-3 text-right">{brl(u.avgTicket)}</td>
                      <td className={`px-4 py-3 text-right ${u.cancelRate >= 10 ? "text-red-600 font-semibold" : ""}`}>{u.cancelRate.toLocaleString("pt-BR")}%</td>
                      <td className="px-4 py-3 text-right">{u.newCustomers}</td>
                      <td className="px-4 py-3 text-right">{u.replenishment === null ? "—" : brl(u.replenishment)}</td>
                      <td className={`px-4 py-3 text-right ${u.lowStock > 0 ? "text-amber-700 font-semibold" : ""}`}>{u.lowStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100"><th className="px-4 py-3 font-medium">Unidade</th><th className="px-4 py-3 font-medium text-right">A pagar (aberto)</th><th className="px-4 py-3 font-medium text-right">A pagar vencido</th><th className="px-4 py-3 font-medium text-right">A receber (aberto)</th><th className="px-4 py-3 font-medium text-right">A receber vencido</th></tr></thead>
                <tbody>
                  {data.units.map((u) => (
                    <tr key={u.id} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-zinc-900">{u.name}</td>
                      <td className="px-4 py-3 text-right">{brl(u.finance.payableOpen)}</td>
                      <td className={`px-4 py-3 text-right ${u.finance.payableOverdue > 0 ? "text-red-600 font-semibold" : ""}`}>{brl(u.finance.payableOverdue)}</td>
                      <td className="px-4 py-3 text-right">{brl(u.finance.receivableOpen)}</td>
                      <td className={`px-4 py-3 text-right ${u.finance.receivableOverdue > 0 ? "text-red-600 font-semibold" : ""}`}>{brl(u.finance.receivableOverdue)}</td>
                    </tr>
                  ))}
                  <tr className="bg-zinc-50 font-semibold"><td className="px-4 py-3">Rede</td>{(["payableOpen", "payableOverdue", "receivableOpen", "receivableOverdue"] as const).map((k) => <td key={k} className="px-4 py-3 text-right">{brl(data.units.reduce((s, u) => s + u.finance[k], 0))}</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <p className="text-sm font-semibold text-zinc-700 mb-3">Produtos mais vendidos na rede</p>
            {data.topProducts.length === 0 ? <p className="text-sm text-zinc-400">Sem vendas no período</p> : (
              <div className="space-y-2">
                {data.topProducts.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-zinc-400">{i + 1}</span><span className="flex-1 min-w-0 truncate">{p.name}</span>
                    <span className="text-zinc-500">{p.quantity} un.</span><span className="w-28 text-right font-medium">{brl(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
