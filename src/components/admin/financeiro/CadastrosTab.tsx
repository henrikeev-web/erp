"use client";

import { useState } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal, errMsg, formatDoc } from "./shared";
import type { CostCenter, Supplier } from "./shared";

// ── Fornecedores ────────────────────────────────────────────────────────────

export function SuppliersTab({ suppliers, onChanged }: { suppliers: Supplier[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);

  async function remove(s: Supplier) {
    if (!window.confirm(`Excluir "${s.name}"?\n\nSe houver lançamentos vinculados, ele será apenas desativado para preservar o histórico.`)) return;
    try {
      await axios.delete(`/api/financeiro/fornecedores/${s.id}`);
      onChanged();
    } catch (e) { alert(errMsg(e, "Erro ao excluir")); }
  }
  async function reactivate(s: Supplier) {
    await axios.patch(`/api/financeiro/fornecedores/${s.id}`, { active: true });
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setEditing("new")}>+ Novo fornecedor</Button></div>
      <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100">
            <th className="px-4 py-3 font-medium">Nome</th><th className="px-4 py-3 font-medium">CPF/CNPJ</th>
            <th className="px-4 py-3 font-medium">Telefone</th><th className="px-4 py-3 font-medium">E-mail</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-zinc-400">Nenhum fornecedor cadastrado</td></tr>
            ) : suppliers.map((s) => (
              <tr key={s.id} className={`border-b border-zinc-50 last:border-0 ${s.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 font-medium text-zinc-900">{s.name}{!s.active && <span className="ml-2 text-[11px] font-normal text-zinc-500">(inativo)</span>}</td>
                <td className="px-4 py-3">{formatDoc(s.document)}</td>
                <td className="px-4 py-3">{s.phone ?? "—"}</td>
                <td className="px-4 py-3">{s.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}>Editar</Button>
                    {s.active ? <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(s)}>Excluir</Button>
                      : <Button size="sm" variant="ghost" onClick={() => reactivate(s)}>Reativar</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <SupplierModal supplier={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [document, setDocument] = useState(supplier?.document ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError("");
    const body = { name, document: document || null, phone: phone || null, email: email || null, notes: notes || null };
    try {
      if (supplier) await axios.patch(`/api/financeiro/fornecedores/${supplier.id}`, body);
      else await axios.post("/api/financeiro/fornecedores", body);
      onSaved();
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  }

  return (
    <Modal title={supplier ? "Editar fornecedor" : "Novo fornecedor"} onClose={onClose}>
      <Field label="Nome *"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CPF/CNPJ"><Input inputMode="numeric" value={document} onChange={(e) => setDocument(e.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="Só números" /></Field>
        <Field label="Telefone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Observações"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" /></Field>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </div>
    </Modal>
  );
}

// ── Centros de custo ────────────────────────────────────────────────────────

export function CostCentersTab({ centers, onChanged }: { centers: CostCenter[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");

  async function add() {
    if (!name.trim()) return;
    setError("");
    try { await axios.post("/api/financeiro/centros-custo", { name }); setName(""); onChanged(); }
    catch (e) { setError(errMsg(e)); }
  }
  async function rename() {
    if (!editing) return;
    try { await axios.patch(`/api/financeiro/centros-custo/${editing.id}`, { name: editing.name }); setEditing(null); onChanged(); }
    catch (e) { alert(errMsg(e)); }
  }
  async function remove(c: CostCenter) {
    if (!window.confirm(`Excluir "${c.name}"?\n\nSe houver lançamentos vinculados, será apenas desativado para preservar o histórico.`)) return;
    try { await axios.delete(`/api/financeiro/centros-custo/${c.id}`); onChanged(); }
    catch (e) { alert(errMsg(e, "Erro ao excluir")); }
  }
  async function reactivate(c: CostCenter) {
    await axios.patch(`/api/financeiro/centros-custo/${c.id}`, { active: true });
    onChanged();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-zinc-500">Centros de custo agrupam despesas e receitas (ex.: Aluguel, Salários, Marketing, Frete) e alimentam o resumo por categoria.</p>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Novo centro de custo…" />
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={add}>Adicionar</Button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="bg-white rounded-2xl border border-zinc-100 divide-y divide-zinc-50">
        {centers.length === 0 && <div className="text-center py-10 text-zinc-400 text-sm">Nenhum centro de custo</div>}
        {centers.map((c) => (
          <div key={c.id} className={`flex items-center justify-between px-4 py-3 ${c.active ? "" : "opacity-50"}`}>
            {editing?.id === c.id ? (
              <div className="flex gap-2 flex-1 mr-3">
                <Input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && rename()} autoFocus />
                <Button size="sm" onClick={rename}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              </div>
            ) : (
              <>
                <span className="text-sm font-medium text-zinc-900">{c.name}{!c.active && <span className="ml-2 text-[11px] font-normal text-zinc-500">(inativo)</span>}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ id: c.id, name: c.name })}>Renomear</Button>
                  {c.active ? <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(c)}>Excluir</Button>
                    : <Button size="sm" variant="ghost" onClick={() => reactivate(c)}>Reativar</Button>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
