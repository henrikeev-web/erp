"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { ChevronDown, ChevronRight, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal, brl, errMsg, fmtDate, selectCls, todayStr } from "@/components/admin/financeiro/shared";

interface Delivery { orderId: string; number: number; time: string; day: string; zone: string | null; neighborhood: string | null; deliveryFee: number; courierFee: number }
interface Day { day: string; count: number; total: number; payable: { id: string; status: string } | null }
interface Report { courier: { id: string; name: string; pixKey: string | null }; deliveries: Delivery[]; days: Day[]; totals: { count: number; total: number; feesCharged: number } }
interface ReportData { de: string; ate: string; today: string; couriers: Report[]; totals: { count: number; total: number; feesCharged: number; margin: number }; inRoute: number }
interface Courier { id: string; name: string; phone: string | null; pixKey: string | null; document: string | null; notes: string | null; active: boolean }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const PRESETS = [
  { label: "Hoje", r: () => [todayStr(), todayStr()] },
  { label: "Ontem", r: () => [daysAgo(1), daysAgo(1)] },
  { label: "7 dias", r: () => [daysAgo(6), todayStr()] },
  { label: "Este mês", r: () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), todayStr()]; } },
] as const;

export default function EntregadoresClient() {
  const [tab, setTab] = useState<"report" | "cadastro">("report");
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Entregadores</h1>
        <p className="text-zinc-500 text-sm">Pagos por entrega, conforme a região. O custo diário vai para Contas a pagar.</p>
      </div>
      <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
        {([["report", "Relatório de entregas"], ["cadastro", "Cadastro"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === v ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>{l}</button>
        ))}
      </div>
      {tab === "report" ? <ReportTab /> : <CadastroTab />}
    </div>
  );
}

function ReportTab() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [courierId, setCourierId] = useState("");
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    axios.get("/api/entregadores", { params: { todos: true } }).then(({ data }) => alive && setCouriers(data));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    axios.get("/api/entregadores/relatorio", { params: { de: from, ate: to, entregadorId: courierId || undefined } })
      .then(({ data }) => { if (alive) { setData(data); setError(""); } })
      .catch((e) => alive && setError(errMsg(e, "Erro ao carregar")));
    return () => { alive = false; };
  }, [from, to, courierId]);

  const print = (id: string) => window.open(`/api/entregadores/${id}/relatorio?de=${from}&ate=${to}`, "_blank", "width=820,height=900,popup=1");
  const dayStatus = (d: Day, today: string) =>
    d.payable ? ({ OPEN: ["A pagar", "bg-amber-50 text-amber-700"], PAID: ["Pago", "bg-emerald-50 text-emerald-700"], CANCELLED: ["Cancelado", "bg-zinc-100 text-zinc-500"] } as Record<string, [string, string]>)[d.payable.status]
    : d.day >= today ? ["Dia em aberto", "bg-blue-50 text-blue-700"] : ["Sem custo", "bg-zinc-100 text-zinc-500"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="text-xs font-medium text-zinc-500 block mb-1">De</label><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10" /></div>
        <div><label className="text-xs font-medium text-zinc-500 block mb-1">até</label><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-10" /></div>
        <div className="flex gap-1 pb-0.5">
          {PRESETS.map((p) => <button key={p.label} onClick={() => { const [a, b] = p.r(); setFrom(a); setTo(b); }} className="px-2.5 py-2 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200">{p.label}</button>)}
        </div>
        <div className="w-48">
          <label className="text-xs font-medium text-zinc-500 block mb-1">Entregador</label>
          <select className={selectCls} value={courierId} onChange={(e) => setCourierId(e.target.value)}>
            <option value="">Todos</option>
            {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      {!data ? <div className="text-center py-12 text-zinc-400">Carregando…</div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Entregas", String(data.totals.count), ""],
              ["A pagar aos entregadores", brl(data.totals.total), "text-orange-600"],
              ["Taxas cobradas dos clientes", brl(data.totals.feesCharged), ""],
              ["Taxas − custo", brl(data.totals.margin), data.totals.margin < 0 ? "text-red-600" : "text-emerald-600"],
            ].map(([t, v, c]) => (
              <div key={t} className="bg-white rounded-2xl border border-zinc-100 p-4"><p className="text-xs text-zinc-500">{t}</p><p className={`text-xl font-bold mt-1 ${c}`}>{v}</p></div>
            ))}
          </div>
          {data.inRoute > 0 && <p className="text-xs text-zinc-500">{data.inRoute} pedido{data.inRoute > 1 ? "s" : ""} de entrega em andamento (entram no relatório quando forem entregues).</p>}

          {data.couriers.length === 0 ? <div className="text-center py-12 text-zinc-400 bg-white rounded-2xl border border-zinc-100">Nenhuma entrega no período</div> : data.couriers.map((r) => (
            <section key={r.courier.id} className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 flex-wrap gap-2">
                <div>
                  <p className="font-semibold text-zinc-900">{r.courier.name}</p>
                  <p className="text-xs text-zinc-500">{r.totals.count} entrega{r.totals.count !== 1 ? "s" : ""}{r.courier.pixKey ? ` · PIX: ${r.courier.pixKey}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-bold text-orange-600">{brl(r.totals.total)}</p>
                  <Button size="sm" variant="outline" onClick={() => print(r.courier.id)}><Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir</Button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-50"><th className="px-5 py-2 font-medium">Dia</th><th className="px-3 py-2 font-medium">Entregas</th><th className="px-3 py-2 font-medium text-right">Valor</th><th className="px-5 py-2 font-medium">Financeiro</th></tr></thead>
                <tbody>
                  {r.days.map((d) => {
                    const key = `${r.courier.id}:${d.day}`; const [label, cls] = dayStatus(d, data.today);
                    return (
                      <Fragment key={key}>
                        <tr className="border-b border-zinc-50 cursor-pointer hover:bg-zinc-50/60" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
                          <td className="px-5 py-2.5 whitespace-nowrap">{open[key] ? <ChevronDown className="w-3.5 h-3.5 inline mr-1 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 inline mr-1 text-zinc-400" />}{fmtDate(d.day)}</td>
                          <td className="px-3 py-2.5">{d.count}</td>
                          <td className="px-3 py-2.5 text-right font-medium">{brl(d.total)}</td>
                          <td className="px-5 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span></td>
                        </tr>
                        {open[key] && r.deliveries.filter((x) => x.day === d.day).map((x) => (
                          <tr key={x.orderId} className="bg-zinc-50/60 text-xs text-zinc-600">
                            <td className="px-5 py-1.5 pl-10">#{x.number} · {x.time}</td>
                            <td className="px-3 py-1.5">{x.zone ?? "—"}{x.neighborhood ? ` · ${x.neighborhood}` : ""}</td>
                            <td className="px-3 py-1.5 text-right">{brl(x.courierFee)} <span className="text-zinc-400">(taxa {brl(x.deliveryFee)})</span></td>
                            <td />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
          <p className="text-xs text-zinc-500">O total de cada dia encerrado vira uma conta a pagar (centro de custo “Entregadores”) na virada do dia. O dia de hoje entra amanhã.</p>
        </>
      )}
    </div>
  );
}

function CadastroTab() {
  const [list, setList] = useState<Courier[]>([]);
  const [editing, setEditing] = useState<Courier | "new" | null>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    let alive = true;
    axios.get("/api/entregadores", { params: { todos: true } }).then(({ data }) => alive && setList(data));
    return () => { alive = false; };
  }, [v]);
  const reload = useCallback(() => setV((x) => x + 1), []);

  async function remove(c: Courier) {
    if (!window.confirm(`Excluir "${c.name}"?\n\nSe ele já tiver entregas, será apenas desativado (o histórico e o financeiro dependem dele).`)) return;
    try { await axios.delete(`/api/entregadores/${c.id}`); reload(); } catch (e) { alert(errMsg(e, "Erro ao excluir")); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setEditing("new")}>+ Novo entregador</Button></div>
      <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100"><th className="px-4 py-3 font-medium">Nome</th><th className="px-4 py-3 font-medium">Telefone</th><th className="px-4 py-3 font-medium">Chave PIX</th><th className="px-4 py-3" /></tr></thead>
          <tbody>
            {list.length === 0 ? <tr><td colSpan={4} className="text-center py-12 text-zinc-400">Nenhum entregador cadastrado</td></tr> : list.map((c) => (
              <tr key={c.id} className={`border-b border-zinc-50 last:border-0 ${c.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 font-medium text-zinc-900">{c.name}{!c.active && <span className="ml-2 text-[11px] font-normal text-zinc-500">(inativo)</span>}</td>
                <td className="px-4 py-3">{c.phone ?? "—"}</td>
                <td className="px-4 py-3">{c.pixKey ?? "—"}</td>
                <td className="px-4 py-3"><div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>Editar</Button>
                  {c.active ? <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(c)}>Excluir</Button>
                    : <Button size="sm" variant="ghost" onClick={async () => { await axios.patch(`/api/entregadores/${c.id}`, { active: true }); reload(); }}>Reativar</Button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CourierModal courier={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function CourierModal({ courier, onClose, onSaved }: { courier: Courier | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(courier?.name ?? "");
  const [phone, setPhone] = useState(courier?.phone ?? "");
  const [pixKey, setPixKey] = useState(courier?.pixKey ?? "");
  const [document, setDocument] = useState(courier?.document ?? "");
  const [notes, setNotes] = useState(courier?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError("");
    const body = { name, phone: phone || null, pixKey: pixKey || null, document: document || null, notes: notes || null };
    try {
      if (courier) await axios.patch(`/api/entregadores/${courier.id}`, body); else await axios.post("/api/entregadores", body);
      onSaved();
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  }

  return (
    <Modal title={courier ? "Editar entregador" : "Novo entregador"} onClose={onClose}>
      <Field label="Nome *"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefone"><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(17) 99999-9999" /></Field>
        <Field label="CPF"><Input inputMode="numeric" value={document} onChange={(e) => setDocument(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="Só números" /></Field>
      </div>
      <Field label="Chave PIX" hint="Aparece no relatório para facilitar o pagamento."><Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} /></Field>
      <Field label="Observações"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" /></Field>
      <p className="text-[11px] text-zinc-500">O entregador não tem acesso ao sistema.</p>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </div>
    </Modal>
  );
}
