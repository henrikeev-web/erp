"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal, brl, errMsg, selectCls } from "@/components/admin/financeiro/shared";
import { isComboAvailable, validateComboDefinition } from "@/lib/combo";
import type { ComboOption } from "@/lib/combo";

interface ComboRow {
  id: string; name: string; description: string | null; price: number; comboSize: number; active: boolean; featured: boolean;
  categoryId: string | null; category: { id: string; name: string } | null; images: { url: string }[];
  comboItems: { productId: string; maxQty: number | null; product: { id: string; name: string; active: boolean; stockItem: { quantity: number } | null } }[];
}
interface Simple { id: string; name: string; active: boolean; kind?: string; stockItem: { quantity: number } | null }

// Combo vendável = as opções com estoque somam ao menos a quantidade exata (mesma regra do cardápio)
const availableOf = (c: ComboRow) => {
  const opts: ComboOption[] = c.comboItems.map((i) => ({ productId: i.productId, name: i.product.name, maxQty: i.maxQty, active: i.product.active, stock: i.product.stockItem ? i.product.stockItem.quantity : null }));
  return isComboAvailable(opts, c.comboSize);
};

export default function CombosClient() {
  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ComboRow | "new" | null>(null);
  const [v, setV] = useState(0);

  useEffect(() => {
    let alive = true;
    axios.get("/api/combos").then(({ data }) => { if (alive) { setCombos(data); setLoading(false); } });
    return () => { alive = false; };
  }, [v]);
  const reload = () => setV((x) => x + 1);

  async function toggle(c: ComboRow) {
    if (c.active && !window.confirm(`Desativar "${c.name}"? Ele some do cardápio; os pedidos já feitos ficam intactos.`)) return;
    if (c.active) await axios.delete(`/api/combos/${c.id}`);
    else await axios.put(`/api/combos/${c.id}`, { name: c.name, description: c.description, price: c.price, comboSize: c.comboSize, categoryId: c.categoryId, active: true, items: c.comboItems.map((i) => ({ productId: i.productId, maxQty: i.maxQty })) });
    reload();
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Combos personalizados</h1>
          <p className="text-zinc-500 text-sm">Preço fixo e quantidade exata: o cliente escolhe quanto quer de cada produto. O estoque baixa dos produtos individuais.</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setEditing("new")}>+ Novo combo</Button>
      </div>

      {loading ? <div className="text-center py-16 text-zinc-400">Carregando…</div> : combos.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 bg-white rounded-2xl border border-zinc-100">Nenhum combo cadastrado</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {combos.map((c) => {
            const ok = availableOf(c);
            return (
              <div key={c.id} className={`bg-white rounded-2xl border border-zinc-100 p-5 space-y-3 ${c.active ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  {c.images[0] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.images[0].url} alt="" className="w-16 h-16 rounded-xl object-cover" /> : <div className="w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center text-2xl">🍱</div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900">{c.name}</p>
                    <p className="text-sm text-zinc-500">{c.comboSize} itens · <strong className="text-zinc-800">{brl(c.price)}</strong> fixo{c.category ? ` · ${c.category.name}` : ""}</p>
                    <div className="flex gap-1.5 mt-1">
                      {!c.active && <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-semibold">Inativo</span>}
                      {c.active && !ok && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold">Sem estoque para montar</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.comboItems.map((i) => {
                    const out = !i.product.active || (i.product.stockItem !== null && i.product.stockItem.quantity <= 0);
                    return (
                      <span key={i.productId} className={`text-xs px-2 py-1 rounded-lg ${out ? "bg-zinc-100 text-zinc-400 line-through" : "bg-orange-50 text-orange-800"}`} title={out ? "sem estoque" : undefined}>
                        {i.product.name}{i.maxQty !== null ? ` (máx ${i.maxQty})` : ""}
                      </span>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>Editar</Button>
                  <Button size="sm" variant="ghost" className={c.active ? "text-red-600" : ""} onClick={() => toggle(c)}>{c.active ? "Desativar" : "Reativar"}</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <ComboModal combo={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

interface Line { productId: string; name: string; stock: number | null; active: boolean; maxQty: string }

function ComboModal({ combo, onClose, onSaved }: { combo: ComboRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(combo?.name ?? "");
  const [description, setDescription] = useState(combo?.description ?? "");
  const [price, setPrice] = useState(combo ? String(combo.price) : "");
  const [size, setSize] = useState(combo ? String(combo.comboSize) : "20");
  const [categoryId, setCategoryId] = useState(combo?.categoryId ?? "");
  const [active, setActive] = useState(combo?.active ?? true);
  const [lines, setLines] = useState<Line[]>((combo?.comboItems ?? []).map((i) => ({ productId: i.productId, name: i.product.name, stock: i.product.stockItem ? i.product.stockItem.quantity : null, active: i.product.active, maxQty: i.maxQty === null ? "" : String(i.maxQty) })));
  const [file, setFile] = useState<File | null>(null);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Simple[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    axios.get("/api/categorias", { params: { includeInactive: true } }).then(({ data }) => alive && setCats(data));
    axios.get("/api/produtos", { params: { includeInactive: true } }).then(({ data }) => alive && setProducts(data.filter((p: Simple) => p.kind !== "COMBO" && p.active)));
    return () => { alive = false; };
  }, []);

  const sizeN = parseInt(size);
  const items = lines.map((l) => ({ maxQty: l.maxQty === "" ? null : parseInt(l.maxQty) }));
  const definitionError = validateComboDefinition(sizeN, items);
  const capacity = Number.isInteger(sizeN) ? items.reduce((s, i) => s + Math.min(i.maxQty ?? sizeN, sizeN), 0) : 0;

  const candidates = useMemo(() => {
    const taken = new Set(lines.map((l) => l.productId));
    const t = q.trim().toLowerCase();
    return products.filter((p) => !taken.has(p.id) && (!t || p.name.toLowerCase().includes(t))).slice(0, 30);
  }, [products, lines, q]);

  async function save() {
    setError("");
    if (name.trim().length < 2) return setError("Informe o nome do combo");
    if (!(parseFloat(price) > 0)) return setError("Informe o preço fixo do combo");
    if (definitionError) return setError(definitionError);
    setSaving(true);
    try {
      const body = { name, description: description || null, price: parseFloat(price), comboSize: sizeN, categoryId: categoryId || null, active, items: lines.map((l) => ({ productId: l.productId, maxQty: l.maxQty === "" ? null : parseInt(l.maxQty) })) };
      const { data } = combo ? await axios.put(`/api/combos/${combo.id}`, body) : await axios.post("/api/combos", body);
      if (file) {
        const fd = new FormData(); fd.append("file", file);
        const up = await axios.post("/api/upload", fd);
        await axios.post(`/api/produtos/${data.id}/imagens`, { url: up.data.url, isMain: true });
      }
      onSaved();
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  }

  return (
    <Modal title={combo ? "Editar combo" : "Novo combo"} onClose={onClose} wide>
      <Field label="Nome *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Combo 20 marmitas" autoFocus /></Field>
      <Field label="Descrição"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Preço fixo (R$) *"><Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Quantidade exata *" hint="Quantos itens o cliente monta."><Input type="number" min="2" max="200" value={size} onChange={(e) => setSize(e.target.value)} /></Field>
        <Field label="Categoria">
          <select className={selectCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">—</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="rounded-xl border border-zinc-200 p-3 space-y-3">
        <div>
          <p className="text-sm font-semibold text-zinc-800">Produtos do combo</p>
          <p className="text-[11px] text-zinc-500">O limite por combo é opcional: produto sem limite pode ser escolhido em qualquer quantidade, até completar {Number.isInteger(sizeN) ? sizeN : "a quantidade"}. Use limite nos mais caros (ex.: peixe, máx. 3).</p>
        </div>
        {lines.length > 0 && (
          <div className="space-y-1.5">
            {lines.map((l, idx) => (
              <div key={l.productId} className="flex items-center gap-2 bg-zinc-50 rounded-lg px-3 py-2">
                <span className="flex-1 min-w-0 text-sm truncate">{l.name}{l.stock !== null && <span className="text-zinc-400"> · estoque {l.stock}</span>}{(!l.active || (l.stock !== null && l.stock <= 0)) && <span className="ml-1 text-[11px] text-red-600 font-semibold">sem estoque</span>}</span>
                <label className="text-xs text-zinc-500 whitespace-nowrap">Limite</label>
                <Input type="number" min="1" value={l.maxQty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, maxQty: e.target.value } : x))} placeholder="sem" className="w-20 h-8" />
                <button onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} aria-label="Remover" className="text-zinc-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto para adicionar…" className="pl-9" />
        </div>
        <div className="max-h-40 overflow-y-auto border border-zinc-100 rounded-lg divide-y divide-zinc-50">
          {candidates.map((p) => (
            <button key={p.id} onClick={() => setLines((ls) => [...ls, { productId: p.id, name: p.name, stock: p.stockItem ? p.stockItem.quantity : null, active: p.active, maxQty: "" }])} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50">+ {p.name}</button>
          ))}
          {candidates.length === 0 && <p className="px-3 py-2 text-sm text-zinc-400">Nenhum produto</p>}
        </div>
        <p className={`text-xs ${definitionError ? "text-red-600" : "text-emerald-700"}`}>
          {definitionError ?? `OK — o cliente consegue montar ${sizeN} itens (capacidade ${capacity}).`}
        </p>
      </div>

      <Field label="Foto do combo" hint="Opcional. Aparece no cardápio."><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
      <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo no cardápio</label>
      <p className="text-[11px] text-zinc-500">O revendedor paga o preço do combo (não há preço de revenda para combo).</p>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar combo"}</Button>
      </div>
    </Modal>
  );
}
