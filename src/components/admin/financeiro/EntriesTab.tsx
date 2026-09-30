"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Repeat, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal, StatusBadge, brl, errMsg, fmtDate, selectCls, todayStr } from "./shared";
import type { CostCenter, Entry, EntryType, Supplier } from "./shared";

interface Props {
  type: EntryType;
  suppliers: Supplier[];
  costCenters: CostCenter[];
  version: number; // muda quando algo foi salvo em outro lugar: recarrega
  onEdit: (e: Entry) => void;
  onChanged: () => void;
}

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "OPEN", label: "Em aberto" },
  { value: "OVERDUE", label: "Vencidos" },
  { value: "PAID", label: "Pagos" },
  { value: "CANCELLED", label: "Cancelados" },
];

export default function EntriesTab({ type, suppliers, costCenters, version, onEdit, onChanged }: Props) {
  const isPayable = type === "PAYABLE";
  const [status, setStatus] = useState("OPEN");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [q, setQ] = useState("");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState({ count: 0, amount: 0 });
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/financeiro/lancamentos", {
        params: { tipo: type, status: status || undefined, de: from || undefined, ate: to || undefined, fornecedorId: supplierId || undefined, centroCustoId: costCenterId || undefined, q: q || undefined, limit: 200 },
      });
      setEntries(data.entries);
      setTotal({ count: data.total, amount: data.totalAmount });
    } finally {
      setLoading(false);
    }
  }, [type, status, from, to, supplierId, costCenterId, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, version, q]);

  async function act(e: Entry, action: "cancel" | "reopen") {
    if (action === "cancel" && !window.confirm(`Cancelar "${e.description}"?`)) return;
    try {
      await axios.patch(`/api/financeiro/lancamentos/${e.id}`, { action });
      onChanged();
    } catch (err) {
      alert(errMsg(err, "Erro ao atualizar"));
    }
  }

  async function remove(e: Entry) {
    if (!window.confirm(`Excluir "${e.description}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await axios.delete(`/api/financeiro/lancamentos/${e.id}`);
      onChanged();
    } catch (err) {
      alert(errMsg(err, "Erro ao excluir"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label className="text-xs font-medium text-zinc-500 block mb-1">Situação</label>
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">Vencimento de</label>
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-10" />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">até</label>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-10" />
        </div>
        {isPayable && (
          <div className="w-44">
            <label className="text-xs font-medium text-zinc-500 block mb-1">Fornecedor</label>
            <select className={selectCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Todos</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div className="w-44">
          <label className="text-xs font-medium text-zinc-500 block mb-1">Centro de custo</label>
          <select className={selectCls} value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
            <option value="">Todos</option>
            {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar descrição…" className="pl-9 h-10" />
        </div>
        {(from || to || supplierId || costCenterId || q || status !== "OPEN") && (
          <button onClick={() => { setStatus("OPEN"); setFrom(""); setTo(""); setSupplierId(""); setCostCenterId(""); setQ(""); }} className="text-xs text-orange-600 hover:underline pb-3">
            Limpar filtros
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b border-zinc-100">
              <th className="px-4 py-3 font-medium">Vencimento</th>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium">{isPayable ? "Fornecedor / Entregador" : "Cliente"}</th>
              <th className="px-4 py-3 font-medium">Centro de custo</th>
              <th className="px-4 py-3 font-medium text-right">Valor</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-zinc-400">Carregando…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-zinc-400">Nenhum lançamento encontrado</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60">
                <td className={`px-4 py-3 whitespace-nowrap ${e.overdue ? "text-red-600 font-medium" : ""}`}>{fmtDate(e.dueDate)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-zinc-900">{e.description}</span>
                    {e.source === "RECURRING" && <span title="Vem de uma recorrência"><Repeat className="w-3.5 h-3.5 text-zinc-400" /></span>}
                  </div>
                  {e.status === "PAID" && (
                    <div className="text-[11px] text-emerald-700">
                      Pago em {fmtDate(e.paidAt)}{e.paidAmount !== null && e.paidAmount !== e.amount ? ` · ${brl(e.paidAmount)}` : ""}{e.payMethod ? ` · ${e.payMethod}` : ""}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-600">{(isPayable ? e.supplier?.name ?? e.courier?.name : e.customer?.name) ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-600">{e.costCenter?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{brl(e.amount)}</td>
                <td className="px-4 py-3"><StatusBadge e={e} /></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1 whitespace-nowrap">
                    {e.status === "OPEN" && (
                      <>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setPaying(e)}>{isPayable ? "Pagar" : "Receber"}</Button>
                        <Button size="sm" variant="outline" onClick={() => onEdit(e)}>Editar</Button>
                        <Button size="sm" variant="ghost" onClick={() => act(e, "cancel")}>Cancelar</Button>
                      </>
                    )}
                    {e.status !== "OPEN" && <Button size="sm" variant="outline" onClick={() => act(e, "reopen")}>Reabrir</Button>}
                    {e.source === "MANUAL" && e.status !== "PAID" && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(e)}>Excluir</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && entries.length > 0 && (
        <p className="text-sm text-zinc-600">
          {total.count} lançamento{total.count !== 1 ? "s" : ""} · total <strong>{brl(total.amount)}</strong>
          {total.count > entries.length && <span className="text-zinc-400"> (mostrando os {entries.length} primeiros)</span>}
        </p>
      )}

      {paying && <PayModal entry={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); onChanged(); }} />}
    </div>
  );
}

function PayModal({ entry, onClose, onDone }: { entry: Entry; onClose: () => void; onDone: () => void }) {
  const isPayable = entry.type === "PAYABLE";
  const [paidAt, setPaidAt] = useState(todayStr());
  const [paidAmount, setPaidAmount] = useState(String(entry.amount));
  const [payMethod, setPayMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await axios.patch(`/api/financeiro/lancamentos/${entry.id}`, { action: "pay", paidAt, paidAmount: parseFloat(paidAmount.replace(",", ".")), payMethod: payMethod || undefined });
      onDone();
    } catch (e) {
      setError(errMsg(e, "Erro ao registrar"));
      setSaving(false);
    }
  }

  return (
    <Modal title={isPayable ? "Registrar pagamento" : "Registrar recebimento"} onClose={onClose}>
      <p className="text-sm text-zinc-600">{entry.description} · vence {fmtDate(entry.dueDate)} · <strong>{brl(entry.amount)}</strong></p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isPayable ? "Data do pagamento" : "Data do recebimento"}>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        <Field label="Valor efetivo (R$)" hint="Mude se houve juros, multa ou desconto.">
          <Input type="number" step="0.01" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
        </Field>
      </div>
      <Field label="Forma de pagamento">
        <select className={selectCls} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
          <option value="">—</option>
          {["PIX", "Boleto", "Transferência", "Dinheiro", "Cartão", "Débito em conta"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button>
      </div>
    </Modal>
  );
}
