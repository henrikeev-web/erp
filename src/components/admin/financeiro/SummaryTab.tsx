"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, TrendingUp } from "lucide-react";
import { brl } from "./shared";

interface Box { amount: number; count: number }
interface Summary {
  today: string;
  payable: { open: Box; overdue: Box; next7: Box; upTo30: Box };
  receivable: { open: Box; overdue: Box; next7: Box; upTo30: Box };
  projection30: number;
  month: { paid: number; received: number };
  byCostCenter: { costCenterId: string | null; name: string; amount: number }[];
}

function Card({ title, value, sub, tone, icon }: { title: string; value: string; sub?: string; tone?: "red" | "green" | "amber" | "zinc"; icon: React.ReactNode }) {
  const c = { red: "text-red-600", green: "text-emerald-600", amber: "text-amber-600", zinc: "text-zinc-900" }[tone ?? "zinc"];
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-4">
      <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">{title}{icon}</div>
      <div className={`mt-2 text-2xl font-bold ${c}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

const cnt = (b: Box) => `${b.count} lançamento${b.count !== 1 ? "s" : ""}`;

export default function SummaryTab({ version }: { version: number }) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => { axios.get("/api/financeiro/resumo").then(({ data }) => setS(data)); }, [version]);
  if (!s) return <div className="text-center py-16 text-zinc-400">Carregando…</div>;

  const max = Math.max(1, ...s.byCostCenter.map((c) => c.amount));
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-700 mb-2">A pagar</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card title="Em aberto" value={brl(s.payable.open.amount)} sub={cnt(s.payable.open)} icon={<ArrowUpCircle className="w-4 h-4" />} />
          <Card title="Vencido" value={brl(s.payable.overdue.amount)} sub={cnt(s.payable.overdue)} tone={s.payable.overdue.count ? "red" : "zinc"} icon={<AlertTriangle className="w-4 h-4" />} />
          <Card title="Próximos 7 dias" value={brl(s.payable.next7.amount)} sub={cnt(s.payable.next7)} tone="amber" icon={<CalendarClock className="w-4 h-4" />} />
          <Card title="Pago no mês" value={brl(s.month.paid)} tone="zinc" icon={<ArrowUpCircle className="w-4 h-4" />} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-700 mb-2">A receber</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card title="Em aberto" value={brl(s.receivable.open.amount)} sub={cnt(s.receivable.open)} icon={<ArrowDownCircle className="w-4 h-4" />} />
          <Card title="Vencido" value={brl(s.receivable.overdue.amount)} sub={cnt(s.receivable.overdue)} tone={s.receivable.overdue.count ? "red" : "zinc"} icon={<AlertTriangle className="w-4 h-4" />} />
          <Card title="Próximos 7 dias" value={brl(s.receivable.next7.amount)} sub={cnt(s.receivable.next7)} tone="amber" icon={<CalendarClock className="w-4 h-4" />} />
          <Card title="Recebido no mês" value={brl(s.month.received)} tone="green" icon={<ArrowDownCircle className="w-4 h-4" />} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-100 p-5">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium"><span>Projeção para os próximos 30 dias</span><TrendingUp className="w-4 h-4" /></div>
          <div className={`mt-2 text-3xl font-bold ${s.projection30 < 0 ? "text-red-600" : "text-emerald-600"}`}>{brl(s.projection30)}</div>
          <p className="text-xs text-zinc-500 mt-2">
            A receber ({brl(s.receivable.upTo30.amount)}) menos a pagar ({brl(s.payable.upTo30.amount)}), contando tudo em aberto até 30 dias, inclusive o já vencido.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 p-5">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Despesas do mês por centro de custo</h3>
          {s.byCostCenter.length === 0 ? <p className="text-sm text-zinc-400">Sem despesas neste mês</p> : (
            <div className="space-y-2.5">
              {s.byCostCenter.map((c) => (
                <div key={c.costCenterId ?? "none"}>
                  <div className="flex justify-between text-sm"><span className="text-zinc-700">{c.name}</span><span className="font-medium">{brl(c.amount)}</span></div>
                  <div className="h-1.5 bg-zinc-100 rounded-full mt-1"><div className="h-1.5 bg-orange-400 rounded-full" style={{ width: `${(c.amount / max) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
