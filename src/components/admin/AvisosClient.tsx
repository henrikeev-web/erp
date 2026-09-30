"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal, errMsg, selectCls } from "@/components/admin/financeiro/shared";

interface Row { id: string; title: string; body: string; kind: "POPUP" | "NOTICE"; level: "INFO" | "SUCCESS" | "WARNING"; startsAt: string; endsAt: string | null; active: boolean; allUnits: boolean; unitIds: string[]; unitNames: string[] | null; reads: number; audience: number }
interface Fr { id: string; name: string }

const toLocal = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const LEVELS = { INFO: "Informação", SUCCESS: "Boa notícia", WARNING: "Atenção" } as const;

export default function AvisosClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [v, setV] = useState(0);
  const [now, setNow] = useState(() => Date.now()); // referência do "agora" para agendado/expirado (atualiza a cada carga)
  useEffect(() => { let alive = true; axios.get("/api/avisos").then(({ data }) => { if (alive) { setRows(data); setNow(Date.now()); setLoading(false); } }); return () => { alive = false; }; }, [v]);
  const reload = () => setV((x) => x + 1);

  const status = (r: Row) => !r.active ? ["Encerrado", "bg-zinc-100 text-zinc-500"] : new Date(r.startsAt).getTime() > now ? ["Agendado", "bg-blue-50 text-blue-700"] : r.endsAt && new Date(r.endsAt).getTime() <= now ? ["Expirado", "bg-zinc-100 text-zinc-500"] : ["No ar", "bg-emerald-50 text-emerald-700"];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h1 className="text-2xl font-bold text-zinc-900">Avisos para as franquias</h1><p className="text-zinc-500 text-sm">Pop-up abre ao entrar no painel da franquia (uma vez por usuário). Aviso fica no sino de notificações.</p></div>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setEditing("new")}>+ Novo aviso</Button>
      </div>
      <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100"><th className="px-4 py-3 font-medium">Aviso</th><th className="px-4 py-3 font-medium">Tipo</th><th className="px-4 py-3 font-medium">Para</th><th className="px-4 py-3 font-medium">Período</th><th className="px-4 py-3 font-medium text-right">Lido por</th><th className="px-4 py-3 font-medium">Situação</th><th className="px-4 py-3" /></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-12 text-zinc-400">Carregando…</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-zinc-400">Nenhum aviso criado</td></tr> : rows.map((r) => {
              const [sl, sc] = status(r);
              return (
                <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3 max-w-xs"><p className="font-medium text-zinc-900 truncate">{r.title}</p><p className="text-xs text-zinc-500 truncate">{r.body.replace(/\s+/g, " ")}</p></td>
                  <td className="px-4 py-3">{r.kind === "POPUP" ? "Pop-up" : "Aviso"} <span className="text-xs text-zinc-400">· {LEVELS[r.level]}</span></td>
                  <td className="px-4 py-3 text-zinc-600">{r.allUnits ? "Todas as franquias" : r.unitNames?.join(", ")}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{fmt(r.startsAt)}<br />até {fmt(r.endsAt)}</td>
                  <td className="px-4 py-3 text-right">{r.reads} de {r.audience}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${sc}`}>{sl}</span></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => setEditing(r)}>Editar</Button><Button size="sm" variant="ghost" className={r.active ? "text-red-600" : ""} onClick={async () => { if (r.active) await axios.delete(`/api/avisos/${r.id}`); else await axios.patch(`/api/avisos/${r.id}`, { active: true }); reload(); }}>{r.active ? "Encerrar" : "Reativar"}</Button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <AvisoModal row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function AvisoModal({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(row?.title ?? "");
  const [body, setBody] = useState(row?.body ?? "");
  const [kind, setKind] = useState<Row["kind"]>(row?.kind ?? "POPUP");
  const [level, setLevel] = useState<Row["level"]>(row?.level ?? "INFO");
  const [startsAt, setStartsAt] = useState(toLocal(row?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocal(row?.endsAt ?? null));
  const [allUnits, setAllUnits] = useState(row?.allUnits ?? true);
  const [unitIds, setUnitIds] = useState<string[]>(row?.unitIds ?? []);
  const [franchises, setFranchises] = useState<Fr[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; axios.get("/api/franquias").then(({ data }) => alive && setFranchises(data.filter((f: { active: boolean }) => f.active))); return () => { alive = false; }; }, []);

  async function save() {
    setError(""); setSaving(true);
    try {
      const payload = { title, body, kind, level, allUnits, unitIds: allUnits ? [] : unitIds, ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}), endsAt: endsAt ? new Date(endsAt).toISOString() : null };
      if (row) await axios.patch(`/api/avisos/${row.id}`, payload); else await axios.post("/api/avisos", payload);
      onSaved();
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  }

  return (
    <Modal title={row ? "Editar aviso" : "Novo aviso"} onClose={onClose} wide>
      <Field label="Título *"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Campanha de inverno começa segunda" autoFocus /></Field>
      <Field label="Mensagem *"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Como aparece"><select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as Row["kind"])}><option value="POPUP">Pop-up ao entrar no painel</option><option value="NOTICE">Só no sino de avisos</option></select></Field>
        <Field label="Destaque"><select className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as Row["level"])}><option value="INFO">Informação (azul)</option><option value="SUCCESS">Boa notícia (verde)</option><option value="WARNING">Atenção (amarelo)</option></select></Field>
        <Field label="Começa em" hint="Vazio = agora."><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
        <Field label="Termina em" hint="Vazio = até você encerrar."><Input type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} /></Field>
      </div>
      <div className="rounded-xl border border-zinc-200 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={allUnits} onChange={() => setAllUnits(true)} /> Todas as franquias</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!allUnits} onChange={() => setAllUnits(false)} /> Só as franquias escolhidas</label>
        {!allUnits && <div className="pl-6 space-y-1">{franchises.map((f) => <label key={f.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unitIds.includes(f.id)} onChange={(e) => setUnitIds((ids) => e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id))} /> {f.name}</label>)}{franchises.length === 0 && <p className="text-xs text-zinc-400">Nenhuma franquia ativa</p>}</div>}
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button><Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></div>
    </Modal>
  );
}
