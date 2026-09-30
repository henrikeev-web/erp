"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal, brl, errMsg, fmtDate, selectCls } from "@/components/admin/financeiro/shared";

interface HQAward { id: string; name: string; description: string | null; metric: "ORDERS" | "SALES"; threshold: number; startsAt: string | null; endsAt: string | null; reward: string | null; active: boolean; progress: { unitId: string; unitName: string; value: number; pct: number; achievedAt: string | null; deliveredAt: string | null; note: string | null }[] }
interface FrAward { id: string; name: string; description: string | null; metric: "ORDERS" | "SALES"; threshold: number; startsAt: string | null; endsAt: string | null; reward: string | null; value: number; pct: number; achievedAt: string | null; deliveredAt: string | null }

const goal = (a: { metric: string; threshold: number }) => (a.metric === "ORDERS" ? `${a.threshold.toLocaleString("pt-BR")} pedidos` : `${brl(a.threshold)} em vendas`);
const val = (a: { metric: string }, v: number) => (a.metric === "ORDERS" ? `${v} pedidos` : brl(v));
const window_ = (a: { startsAt: string | null; endsAt: string | null }) => (a.startsAt || a.endsAt ? `${a.startsAt ? fmtDate(a.startsAt) : "início"} a ${a.endsAt ? fmtDate(a.endsAt) : "sem fim"}` : "Desde sempre");
const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

function Bar({ pct, done }: { pct: number; done?: boolean }) { return <div className="h-2 bg-zinc-100 rounded-full"><div className={`h-2 rounded-full ${done ? "bg-emerald-500" : "bg-orange-400"}`} style={{ width: `${pct}%` }} /></div>; }

export default function PremiacoesClient() {
  const [data, setData] = useState<{ role: "HQ" | "FRANCHISE"; awards: any[] } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<HQAward | "new" | null>(null);
  const [msg, setMsg] = useState("");
  const [v, setV] = useState(0);
  useEffect(() => { let alive = true; axios.get("/api/premiacoes").then(({ data }) => alive && setData(data)); return () => { alive = false; }; }, [v]);
  const reload = () => setV((x) => x + 1);

  if (!data) return <div className="p-8 text-center text-zinc-400">Carregando…</div>;

  if (data.role === "FRANCHISE") {
    const awards = data.awards as FrAward[];
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-5">
        <div><h1 className="text-2xl font-bold text-zinc-900">Premiações</h1><p className="text-zinc-500 text-sm">Metas definidas pela matriz. Você ganha o prêmio ao atingir a meta.</p></div>
        {awards.length === 0 ? <div className="text-center py-16 text-zinc-400 bg-white rounded-2xl border border-zinc-100">Nenhuma premiação ativa no momento</div> : (
          <div className="grid md:grid-cols-2 gap-4">
            {awards.map((a) => (
              <div key={a.id} className={`rounded-2xl border p-5 space-y-3 ${a.achievedAt ? "bg-emerald-50/50 border-emerald-200" : "bg-white border-zinc-100"}`}>
                <div className="flex items-start gap-3"><span className={`w-10 h-10 rounded-full flex items-center justify-center ${a.achievedAt ? "bg-emerald-100 text-emerald-700" : "bg-orange-50 text-orange-600"}`}><Trophy className="w-5 h-5" /></span><div className="flex-1"><p className="font-semibold text-zinc-900">{a.name}</p><p className="text-xs text-zinc-500">Meta: {goal(a)} · {window_(a)}</p></div></div>
                {a.description && <p className="text-sm text-zinc-600">{a.description}</p>}
                <div><div className="flex justify-between text-xs text-zinc-600 mb-1"><span>{val(a, a.value)} de {goal(a)}</span><span className="font-semibold">{a.pct}%</span></div><Bar pct={a.pct} done={!!a.achievedAt} /></div>
                {a.reward && <p className="text-sm"><span className="text-zinc-500">Prêmio:</span> <strong>{a.reward}</strong></p>}
                {a.achievedAt && <p className="text-sm font-semibold text-emerald-700">🏆 Conquistada em {fmtDate(a.achievedAt)}{a.deliveredAt ? " · prêmio entregue" : " · aguarde o contato da matriz"}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const awards = data.awards as HQAward[];
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 className="text-2xl font-bold text-zinc-900">Premiações da rede</h1><p className="text-zinc-500 text-sm">Metas para as franquias. Ao atingir, a franquia recebe um pop-up de parabéns automaticamente. Conta pedidos não cancelados da franquia.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={async () => { const { data: r } = await axios.post("/api/premiacoes/reavaliar"); setMsg(r.granted ? `${r.granted} conquista(s) nova(s) registrada(s).` : "Nenhuma conquista nova."); reload(); }}>Reavaliar agora</Button><Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setEditing("new")}>+ Nova premiação</Button></div>
      </div>
      {msg && <div className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">{msg}</div>}
      {awards.length === 0 ? <div className="text-center py-16 text-zinc-400 bg-white rounded-2xl border border-zinc-100">Nenhuma premiação criada. Exemplo: primeiros 1.000 pedidos, ou primeiros R$ 10.000 em vendas.</div> : awards.map((a) => (
        <section key={a.id} className={`bg-white rounded-2xl border border-zinc-100 overflow-hidden ${a.active ? "" : "opacity-60"}`}>
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-100 flex-wrap">
            <div><p className="font-semibold text-zinc-900 flex items-center gap-2"><Trophy className="w-4 h-4 text-orange-500" />{a.name}{!a.active && <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">Encerrada</span>}</p><p className="text-xs text-zinc-500 mt-0.5">Meta: {goal(a)} · {window_(a)}{a.reward ? ` · Prêmio: ${a.reward}` : ""}</p></div>
            <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setEditing(a)}>Editar</Button><Button size="sm" variant="ghost" className={a.active ? "text-red-600" : ""} onClick={async () => { if (a.active) await axios.delete(`/api/premiacoes/${a.id}`); else await axios.patch(`/api/premiacoes/${a.id}`, { active: true }); reload(); }}>{a.active ? "Encerrar" : "Reativar"}</Button></div>
          </div>
          <div className="divide-y divide-zinc-50">
            {a.progress.length === 0 && <p className="px-5 py-4 text-sm text-zinc-400">Nenhuma franquia ativa</p>}
            {a.progress.map((p) => (
              <div key={p.unitId} className="px-5 py-3 flex items-center gap-4 flex-wrap">
                <span className="w-48 font-medium text-sm text-zinc-800">{p.unitName}</span>
                <div className="flex-1 min-w-48"><div className="flex justify-between text-xs text-zinc-500 mb-1"><span>{val(a, p.value)}</span><span>{p.pct}%</span></div><Bar pct={p.pct} done={!!p.achievedAt} /></div>
                <div className="w-64 text-right text-sm">
                  {p.achievedAt ? (
                    <div className="flex items-center justify-end gap-2"><span className="text-emerald-700 font-semibold text-xs">🏆 {fmtDate(p.achievedAt)}</span>
                      <Button size="sm" variant={p.deliveredAt ? "outline" : "default"} className={p.deliveredAt ? "" : "bg-emerald-600 hover:bg-emerald-700"} onClick={async () => { try { await axios.patch(`/api/premiacoes/${a.id}/grants/${p.unitId}`, { delivered: !p.deliveredAt }); reload(); } catch (e) { alert(errMsg(e)); } }}>{p.deliveredAt ? "Entregue ✓" : "Marcar entregue"}</Button></div>
                  ) : <span className="text-xs text-zinc-400">em andamento</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {editing && <AwardModal award={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(n) => { setEditing(null); if (n) setMsg(`${n} conquista(s) registrada(s) na hora.`); reload(); }} />}
    </div>
  );
}

function AwardModal({ award, onClose, onSaved }: { award: HQAward | null; onClose: () => void; onSaved: (granted: number) => void }) {
  const [name, setName] = useState(award?.name ?? "");
  const [description, setDescription] = useState(award?.description ?? "");
  const [metric, setMetric] = useState<"ORDERS" | "SALES">(award?.metric ?? "ORDERS");
  const [threshold, setThreshold] = useState(award ? String(award.threshold) : "");
  const [startsAt, setStartsAt] = useState(toLocal(award?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocal(award?.endsAt ?? null));
  const [reward, setReward] = useState(award?.reward ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError(""); setSaving(true);
    try {
      const body = { name, description: description || null, metric, threshold: parseFloat(threshold), startsAt: startsAt ? `${startsAt}T00:00:00-03:00` : null, endsAt: endsAt ? `${endsAt}T23:59:59-03:00` : null, reward: reward || null };
      const { data } = award ? await axios.patch(`/api/premiacoes/${award.id}`, body) : await axios.post("/api/premiacoes", body);
      onSaved(data.grantedNow ?? 0);
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  }

  return (
    <Modal title={award ? "Editar premiação" : "Nova premiação"} onClose={onClose}>
      <Field label="Nome *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Primeiros 1.000 pedidos" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Meta por"><select className={selectCls} value={metric} onChange={(e) => setMetric(e.target.value as "ORDERS" | "SALES")}><option value="ORDERS">Quantidade de pedidos</option><option value="SALES">Faturamento (R$)</option></select></Field>
        <Field label={metric === "ORDERS" ? "Quantidade *" : "Valor em R$ *"}><Input type="number" min="0" step={metric === "ORDERS" ? "1" : "0.01"} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={metric === "ORDERS" ? "1000" : "10000"} /></Field>
        <Field label="Campanha começa em" hint="Vazio = desde sempre."><Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
        <Field label="Campanha termina em" hint="Vazio = sem fim."><Input type="date" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} /></Field>
      </div>
      <Field label="Prêmio"><Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Ex.: Kit de embalagens personalizadas" /></Field>
      <Field label="Descrição (aparece para a franquia)"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" /></Field>
      <p className="text-[11px] text-zinc-500">Conta pedidos não cancelados da franquia dentro do período. Editar a meta não tira conquistas já registradas. Se alguma franquia já tiver atingido, ela ganha na hora.</p>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button><Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></div>
    </Modal>
  );
}
