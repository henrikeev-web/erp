"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, Modal, errMsg, selectCls } from "@/components/admin/financeiro/shared";

interface Franchise {
  id: string; name: string; slug: string; city: string | null; state: string | null; active: boolean; link: string;
  franchisee: { id: string; name: string; phone: string; email: string | null } | null;
  counts: { users: number; orders: number; products: number };
}
interface FUser { id: string; name: string; email: string; role: string; active: boolean }
interface Created { link: string; users: { id: string; name: string; email: string; role: string; tempPassword: string }[]; catalog: { products: { created: number }; combos: { created: number }; categories: { created: number } } | null; catalogError: string | null }

const slugify = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const copy = (t: string) => navigator.clipboard?.writeText(t);

export default function FranquiasClient() {
  const params = useSearchParams();
  const [list, setList] = useState<Franchise[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(params.get("novo") === "1");
  const [managing, setManaging] = useState<string | null>(null);
  const [v, setV] = useState(0);

  useEffect(() => {
    let alive = true;
    axios.get("/api/franquias").then(({ data }) => { if (alive) { setList(data); setLoading(false); } });
    return () => { alive = false; };
  }, [v]);
  const reload = useCallback(() => setV((x) => x + 1), []);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Franquias</h1>
          <p className="text-zinc-500 text-sm">Cada franquia tem o seu link, os seus usuários, estoque e preços. O catálogo vem da matriz.</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" /> Nova franquia</Button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-100">
            <th className="px-4 py-3 font-medium">Franquia</th><th className="px-4 py-3 font-medium">Link de acesso</th><th className="px-4 py-3 font-medium">Franqueado</th>
            <th className="px-4 py-3 font-medium text-right">Usuários</th><th className="px-4 py-3 font-medium text-right">Pedidos</th><th className="px-4 py-3 font-medium">Situação</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-12 text-zinc-400">Carregando…</td></tr>
              : list.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-zinc-400">Nenhuma franquia cadastrada</td></tr>
              : list.map((f) => (
                <tr key={f.id} className={`border-b border-zinc-50 last:border-0 ${f.active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3"><p className="font-medium text-zinc-900">{f.name}</p><p className="text-xs text-zinc-500">{[f.city, f.state].filter(Boolean).join(" / ") || "—"}</p></td>
                  <td className="px-4 py-3"><a href={f.link} target="_blank" rel="noreferrer" className="text-orange-600 hover:underline inline-flex items-center gap-1">{f.link.replace(/^https?:\/\//, "")}<ExternalLink className="w-3 h-3" /></a></td>
                  <td className="px-4 py-3 text-zinc-600">{f.franchisee?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{f.counts.users}</td>
                  <td className="px-4 py-3 text-right">{f.counts.orders}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${f.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{f.active ? "Ativa" : "Inativa"}</span></td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setManaging(f.id)}>Gerenciar</Button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {creating && <NewFranchiseModal onClose={() => { setCreating(false); reload(); }} />}
      {managing && <ManageModal id={managing} onClose={() => { setManaging(null); reload(); }} />}
    </div>
  );
}

// ── Escolha do que NÃO vai para a franquia (produtos e categorias da matriz) ──

interface CatItem { id: string; name: string }
interface ProdItem { id: string; name: string; categoryId: string | null; kind?: string }

function CatalogPicker({ exProds, setExProds, exCats, setExCats }: { exProds: string[]; setExProds: (v: string[]) => void; exCats: string[]; setExCats: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<CatItem[] | null>(null);
  const [prods, setProds] = useState<ProdItem[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || cats) return;
    Promise.all([axios.get("/api/categorias?includeInactive=true"), axios.get("/api/produtos?includeInactive=true")])
      .then(([c, p]) => { setCats(c.data); setProds(p.data); })
      .catch(() => setFailed(true));
  }, [open, cats]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const total = exProds.length + exCats.length;
  const groups = [...(cats ?? []).map((c) => ({ cat: c as CatItem | null, items: prods.filter((p) => p.categoryId === c.id) })), { cat: null, items: prods.filter((p) => !p.categoryId || !(cats ?? []).some((c) => c.id === p.categoryId)) }].filter((g) => g.cat || g.items.length);

  return (
    <div className="rounded-xl border border-zinc-200 p-3 space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="text-sm text-orange-600 hover:underline">
        {open ? "Ocultar" : "Escolher"} produtos e categorias que esta franquia NÃO vai receber{total ? ` (${exCats.length} categorias, ${exProds.length} produtos removidos)` : ""}
      </button>
      {open && (failed ? <p className="text-sm text-red-600">Não foi possível carregar o catálogo da matriz.</p> : !cats ? <p className="text-sm text-zinc-500">Carregando…</p> : (
        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
          <p className="text-[11px] text-zinc-500">Marque o que deve ficar de fora. Vale também para as sincronizações futuras (a franquia não recebe esses itens nem quando a matriz alterar o catálogo). Combos que usam um produto removido também não são copiados.</p>
          {groups.map((g) => {
            const catOut = !!g.cat && exCats.includes(g.cat.id);
            return (
              <div key={g.cat?.id ?? "sem"} className="border border-zinc-100 rounded-lg">
                <label className="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold bg-zinc-50 rounded-t-lg">
                  {g.cat ? <input type="checkbox" checked={catOut} onChange={() => toggle(exCats, setExCats, g.cat!.id)} /> : <span className="w-3.5" />}
                  <span className={catOut ? "line-through text-zinc-400" : ""}>{g.cat?.name ?? "Sem categoria"}</span>
                  {catOut && <span className="text-[11px] font-normal text-red-600">categoria inteira removida</span>}
                </label>
                {g.items.map((p) => (
                  <label key={p.id} className={`flex items-center gap-2 pl-7 pr-2.5 py-1 text-sm ${catOut ? "opacity-40" : ""}`}>
                    <input type="checkbox" disabled={catOut} checked={catOut || exProds.includes(p.id)} onChange={() => toggle(exProds, setExProds, p.id)} />
                    <span className={exProds.includes(p.id) || catOut ? "line-through text-zinc-400" : ""}>{p.name}{p.kind === "COMBO" ? " (combo)" : ""}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Cadastro completo: franquia + link + franqueado + usuários ───────────────

function NewFranchiseModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("SP");
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fDoc, setFDoc] = useState("");
  const [users, setUsers] = useState([{ name: "", email: "", role: "ADMIN" }]);
  const [copyCatalog, setCopyCatalog] = useState(true);
  const [exProds, setExProds] = useState<string[]>([]);
  const [exCats, setExCats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Created | null>(null);

  const linkPreview = `${slug || "cidade"}.banguelas.com.br`;
  const setU = (i: number, patch: Partial<(typeof users)[0]>) => setUsers((us) => us.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));

  async function save() {
    setError(""); setSaving(true);
    try {
      const { data } = await axios.post("/api/franquias", { name, slug, city, state, franchisee: { name: fName, phone: fPhone, email: fEmail || undefined, document: fDoc || undefined }, users, copyCatalog, excludedProductIds: copyCatalog ? exProds : [], excludedCategoryIds: copyCatalog ? exCats : [] });
      setDone(data);
    } catch (e) { setError(errMsg(e, "Erro ao cadastrar")); } finally { setSaving(false); }
  }

  if (done) {
    return (
      <Modal title="Franquia cadastrada" onClose={onClose} wide>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between gap-2">
          <div><p className="text-xs text-emerald-800 font-semibold">Link de acesso</p><a href={done.link} target="_blank" rel="noreferrer" className="text-sm text-emerald-900 underline">{done.link}</a></div>
          <Button size="sm" variant="outline" onClick={() => copy(done.link)}><Copy className="w-3.5 h-3.5" /></Button>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-900">Senhas provisórias — anote agora, não serão mostradas de novo</p>
          {done.users.map((u) => (
            <div key={u.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate"><strong>{u.name}</strong> <span className="text-zinc-500">({u.role === "ADMIN" ? "administrador" : "atendente"})</span><br /><span className="text-zinc-600">{u.email}</span></span>
              <code className="bg-white rounded-lg px-2.5 py-1.5 font-mono tracking-wider">{u.tempPassword}</code>
              <Button size="sm" variant="outline" onClick={() => copy(`${done.link}/admin/login\n${u.email}\n${u.tempPassword}`)} title="Copiar acesso"><Copy className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
          <p className="text-[11px] text-amber-800">O acesso é em <strong>{done.link}/admin/login</strong>. Use o botão de copiar para enviar link, e-mail e senha.</p>
        </div>
        {done.catalog && <p className="text-sm text-zinc-600">Catálogo copiado da matriz: {done.catalog.products.created} produtos, {done.catalog.combos.created} combos e {done.catalog.categories.created} categorias (estoque começa zerado).</p>}
        {done.catalogError && <p className="text-sm text-red-600">O catálogo não foi copiado ({done.catalogError}). Use &quot;Sincronizar catálogo&quot; em Gerenciar.</p>}
        <div className="flex justify-end"><Button className="bg-orange-500 hover:bg-orange-600" onClick={onClose}>Concluir</Button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Nova franquia" onClose={onClose} wide>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Franquia</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome *"><Input value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value.replace(/^banguelas\s+/i, ""))); }} placeholder="Banguelas Ribeirão Preto" autoFocus /></Field>
        <Field label="Link de acesso *" hint={`Endereço: ${linkPreview}`}><Input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} placeholder="ribeirao" /></Field>
        <Field label="Cidade"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label="UF"><Input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} /></Field>
      </div>

      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide pt-1">Franqueado (cliente da matriz)</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome *"><Input value={fName} onChange={(e) => setFName(e.target.value)} /></Field>
        <Field label="Telefone *"><Input inputMode="tel" value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="(16) 99999-9999" /></Field>
        <Field label="E-mail"><Input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} /></Field>
        <Field label="CNPJ / CPF"><Input inputMode="numeric" value={fDoc} onChange={(e) => setFDoc(e.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="Só números" /></Field>
      </div>

      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide pt-1">Usuários da franquia (acesso ao painel)</p>
      <div className="space-y-2">
        {users.map((u, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_130px_auto] gap-2 items-center">
            <Input value={u.name} onChange={(e) => setU(i, { name: e.target.value })} placeholder="Nome" />
            <Input type="email" value={u.email} onChange={(e) => setU(i, { email: e.target.value })} placeholder="E-mail (será o login)" />
            <select className={selectCls} value={u.role} onChange={(e) => setU(i, { role: e.target.value })}><option value="ADMIN">Administrador</option><option value="STAFF">Atendente</option></select>
            <button onClick={() => setUsers((us) => us.filter((_, idx) => idx !== i))} disabled={users.length === 1} aria-label="Remover" className="text-zinc-400 hover:text-red-500 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <button onClick={() => setUsers((us) => [...us, { name: "", email: "", role: "STAFF" }])} className="text-sm text-orange-600 hover:underline">+ Adicionar usuário</button>
        <p className="text-[11px] text-zinc-500">Administrador vê tudo, inclusive financeiro. Atendente opera pedidos e estoque. Senhas provisórias são geradas e mostradas ao final.</p>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={copyCatalog} onChange={(e) => setCopyCatalog(e.target.checked)} /> Copiar o catálogo da matriz agora (produtos, combos e categorias; estoque zerado)</label>
      {copyCatalog && <CatalogPicker exProds={exProds} setExProds={setExProds} exCats={exCats} setExCats={setExCats} />}

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Cadastrando…" : "Cadastrar franquia"}</Button>
      </div>
    </Modal>
  );
}

// ── Gestão: usuários, catálogo, ativar/desativar ─────────────────────────────

function ManageModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<(Franchise & { users: FUser[]; franchiseeCustomer: Franchise["franchisee"] & { cpf: string | null } | null; _count: { orders: number; products: number; customers: number } }) | null>(null);
  const [v, setV] = useState(0);
  const [secret, setSecret] = useState<{ label: string; password: string } | null>(null);
  const [sync, setSync] = useState("");
  const [err, setErr] = useState("");
  const [nu, setNu] = useState({ name: "", email: "", role: "STAFF" });

  useEffect(() => {
    let alive = true;
    axios.get(`/api/franquias/${id}`).then(({ data }) => alive && setD(data));
    return () => { alive = false; };
  }, [id, v]);
  const reload = () => setV((x) => x + 1);

  const run = async (fn: () => Promise<void>) => { setErr(""); try { await fn(); reload(); } catch (e) { setErr(errMsg(e, "Erro")); } };

  if (!d) return <Modal title="Franquia" onClose={onClose}><p className="text-sm text-zinc-400">Carregando…</p></Modal>;

  return (
    <Modal title={d.name} onClose={onClose} wide>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2">
        <a href={d.link} target="_blank" rel="noreferrer" className="text-sm text-orange-600 hover:underline">{d.link}</a>
        <div className="flex gap-1.5 items-center">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${d.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-200 text-zinc-600"}`}>{d.active ? "Ativa" : "Inativa"}</span>
          <Button size="sm" variant="outline" onClick={() => copy(d.link)}><Copy className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">{d._count.products} produtos · {d._count.orders} pedidos · {d._count.customers} clientes · franqueado: {d.franchiseeCustomer?.name ?? "—"} {d.franchiseeCustomer?.phone ? `(${d.franchiseeCustomer.phone})` : ""}</p>

      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Usuários</p>
        <div className="border border-zinc-100 rounded-xl divide-y divide-zinc-50">
          {d.users.map((u) => (
            <div key={u.id} className={`flex items-center gap-2 px-3 py-2 text-sm flex-wrap ${u.active ? "" : "opacity-50"}`}>
              <span className="flex-1 min-w-0"><strong>{u.name}</strong><br /><span className="text-xs text-zinc-500">{u.email}</span></span>
              <select className="h-8 text-xs border border-zinc-200 rounded-lg px-2 bg-white" value={u.role} onChange={(e) => run(async () => { await axios.patch(`/api/franquias/${id}/usuarios/${u.id}`, { role: e.target.value }); })}>
                <option value="ADMIN">Administrador</option><option value="STAFF">Atendente</option>
              </select>
              <Button size="sm" variant="outline" onClick={() => run(async () => { const { data } = await axios.patch(`/api/franquias/${id}/usuarios/${u.id}`, { resetPassword: true }); setSecret({ label: u.email, password: data.tempPassword }); })}>Nova senha</Button>
              <Button size="sm" variant="ghost" className={u.active ? "text-red-600" : ""} onClick={() => run(async () => { await axios.patch(`/api/franquias/${id}/usuarios/${u.id}`, { active: !u.active }); })}>{u.active ? "Desativar" : "Reativar"}</Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <Input className="flex-1 min-w-32" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="Nome" />
          <Input className="flex-1 min-w-40" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="E-mail" />
          <select className="h-10 text-sm border border-zinc-200 rounded-xl px-2 bg-white" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="STAFF">Atendente</option><option value="ADMIN">Administrador</option></select>
          <Button variant="outline" disabled={nu.name.length < 2 || !nu.email} onClick={() => run(async () => { const { data } = await axios.post(`/api/franquias/${id}/usuarios`, nu); setSecret({ label: data.email, password: data.tempPassword }); setNu({ name: "", email: "", role: "STAFF" }); })}>+ Usuário</Button>
        </div>
      </div>

      {secret && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">Senha provisória de {secret.label} — anote agora, não será mostrada de novo</p>
          <div className="flex items-center gap-2 mt-1.5"><code className="flex-1 bg-white rounded-lg px-3 py-2 font-mono tracking-wider">{secret.password}</code><Button size="sm" variant="outline" onClick={() => copy(`${d.link}/admin/login\n${secret.label}\n${secret.password}`)}><Copy className="w-3.5 h-3.5" /></Button></div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-100">
        <Button variant="outline" onClick={() => run(async () => { const { data } = await axios.post(`/api/franquias/${id}/catalogo`); setSync(`Catálogo sincronizado: ${data.products.created} produtos novos, ${data.products.updated} atualizados, ${data.combos.created + data.combos.updated} combos.`); })}>Sincronizar catálogo agora</Button>
        <Button variant="ghost" className={d.active ? "text-red-600" : ""} onClick={() => { if (!d.active || window.confirm(`Desativar "${d.name}"? O link deixa de funcionar na hora (nenhum dado é apagado).`)) run(async () => { await axios.patch(`/api/franquias/${id}`, { active: !d.active }); }); }}>{d.active ? "Desativar franquia" : "Reativar franquia"}</Button>
      </div>
      {sync && <p className="text-xs text-emerald-700">{sync}</p>}
      <p className="text-[11px] text-zinc-500">O catálogo também sincroniza sozinho quando a matriz altera produtos, categorias, combos ou fotos. Estoque e preços definidos pela franquia nunca são sobrescritos.</p>
      {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}
    </Modal>
  );
}
