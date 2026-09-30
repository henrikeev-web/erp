"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { brl, errMsg, fmtDate, frequencyLabel } from "./shared";
import type { Recurring } from "./shared";

interface Props { version: number; onEdit: (r: Recurring) => void; onChanged: () => void }

export default function RecurringTab({ version, onEdit, onChanged }: Props) {
  const [list, setList] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    axios.get("/api/financeiro/recorrentes").then(({ data }) => {
      if (!alive) return;
      setList(data);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [version]);

  async function toggle(r: Recurring) {
    const msg = r.active
      ? `Pausar "${r.description}"? As cobranças futuras em aberto serão removidas; as pagas e vencidas ficam.`
      : `Reativar "${r.description}"? As cobranças dos próximos 60 dias serão geradas.`;
    if (!window.confirm(msg)) return;
    try {
      await axios.patch(`/api/financeiro/recorrentes/${r.id}`, { active: !r.active });
      onChanged();
    } catch (e) { alert(errMsg(e, "Erro ao atualizar")); }
  }

  async function remove(r: Recurring) {
    if (!window.confirm(`Excluir a recorrência "${r.description}"?\n\nAs cobranças futuras em aberto serão removidas. O histórico (pagas e vencidas) permanece.`)) return;
    try {
      await axios.delete(`/api/financeiro/recorrentes/${r.id}`);
      onChanged();
    } catch (e) { alert(errMsg(e, "Erro ao excluir")); }
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500 border-b border-zinc-100">
            <th className="px-4 py-3 font-medium">Descrição</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Frequência</th>
            <th className="px-4 py-3 font-medium">Início</th>
            <th className="px-4 py-3 font-medium">Fim</th>
            <th className="px-4 py-3 font-medium">Fornecedor / Cliente</th>
            <th className="px-4 py-3 font-medium text-right">Valor</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="text-center py-12 text-zinc-400">Carregando…</td></tr>
          ) : list.length === 0 ? (
            <tr><td colSpan={8} className="text-center py-12 text-zinc-400">Nenhuma recorrência. Ao criar um lançamento, escolha uma repetição (mensal, semanal…).</td></tr>
          ) : list.map((r) => (
            <tr key={r.id} className={`border-b border-zinc-50 last:border-0 ${r.active ? "" : "opacity-50"}`}>
              <td className="px-4 py-3 font-medium text-zinc-900">{r.description}{!r.active && <span className="ml-2 text-[11px] font-normal text-zinc-500">(pausada)</span>}</td>
              <td className="px-4 py-3">{r.type === "PAYABLE" ? "A pagar" : "A receber"}</td>
              <td className="px-4 py-3">{frequencyLabel(r.every, r.period)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.startDate)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{r.endDate ? fmtDate(r.endDate) : "Sem fim"}</td>
              <td className="px-4 py-3 text-zinc-600">{r.supplier?.name ?? r.customer?.name ?? "—"}</td>
              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{brl(r.amount)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => onEdit(r)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(r)}>{r.active ? "Pausar" : "Reativar"}</Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r)}>Excluir</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
