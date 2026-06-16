"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Layers, Plus, Pencil, Trash2, RefreshCw, X, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  ageMin: number | null;
  ageMax: number | null;
  order: number;
  active: boolean;
  _count?: { products: number };
}

const EMPTY: Omit<Category, "id" | "active" | "_count"> = {
  name: "", slug: "", imageUrl: null, ageMin: null, ageMax: null, order: 0,
};

function toSlug(name: string) {
  return name.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/categorias?includeInactive=true");
      setCategories(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm(EMPTY);
    setModal({ open: true, editing: null });
  }

  function openEdit(cat: Category) {
    setForm({ name: cat.name, slug: cat.slug, imageUrl: cat.imageUrl, ageMin: cat.ageMin, ageMax: cat.ageMax, order: cat.order });
    setModal({ open: true, editing: cat });
  }

  function handleNameChange(name: string) {
    setForm(f => ({ ...f, name, slug: modal.editing ? f.slug : toSlug(name) }));
  }

  async function save() {
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    try {
      if (modal.editing) {
        await axios.patch(`/api/categorias/${modal.editing.id}`, form);
      } else {
        await axios.post("/api/categorias", form);
      }
      setModal({ open: false, editing: null });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(cat: Category) {
    await axios.patch(`/api/categorias/${cat.id}`, { active: !cat.active });
    load();
  }

  async function confirmDelete(id: string) {
    await axios.delete(`/api/categorias/${id}`);
    setDeleteConfirm(null);
    load();
  }

  const visible = showInactive ? categories : categories.filter(c => c.active);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-zinc-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Categorias</h1>
            <p className="text-zinc-500 text-sm">{categories.filter(c => c.active).length} categorias ativas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowInactive(v => !v)}>
            {showInactive ? <ToggleRight className="w-4 h-4 mr-1.5 text-orange-500" /> : <ToggleLeft className="w-4 h-4 mr-1.5" />}
            {showInactive ? "Ocultar inativas" : "Ver inativas"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button className="bg-orange-500 hover:bg-orange-600" size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1.5" /> Nova categoria
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">Nenhuma categoria encontrada</div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <div className="divide-y divide-zinc-50">
            {visible.sort((a, b) => a.order - b.order).map((cat) => (
              <div key={cat.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 transition-colors ${!cat.active ? "opacity-50" : ""}`}>
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 font-bold text-xs shrink-0">
                  {cat.order || "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    {cat.name}
                    {!cat.active && <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-400 font-medium">Inativa</span>}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    /{cat.slug}
                    {cat.ageMin != null && <> · {cat.ageMin}{cat.ageMax ? `–${cat.ageMax}` : "+"} meses</>}
                    {cat._count != null && <> · {cat._count.products} produto{cat._count.products !== 1 ? "s" : ""}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(cat)}
                    title={cat.active ? "Desativar" : "Ativar"}
                    className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    {cat.active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(cat)}
                    className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(cat.id)}
                    className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-zinc-100">
              <h2 className="font-semibold text-zinc-900">{modal.editing ? "Editar categoria" : "Nova categoria"}</h2>
              <button onClick={() => setModal({ open: false, editing: null })} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-500">Nome *</label>
                <Input value={form.name} onChange={(e) => handleNameChange(e.target.value)} className="mt-1" placeholder="Papinhas 6+ meses" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Slug (URL) *</label>
                <Input value={form.slug} onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))} className="mt-1 font-mono text-sm" placeholder="papinhas-6-meses" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Idade mínima (meses)</label>
                  <Input
                    type="number" min={0}
                    value={form.ageMin ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, ageMin: e.target.value ? Number(e.target.value) : null }))}
                    className="mt-1" placeholder="6"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Idade máxima (meses)</label>
                  <Input
                    type="number" min={0}
                    value={form.ageMax ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, ageMax: e.target.value ? Number(e.target.value) : null }))}
                    className="mt-1" placeholder="9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Ordem de exibição</label>
                  <Input
                    type="number" min={0}
                    value={form.order}
                    onChange={(e) => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">URL da imagem</label>
                  <Input value={form.imageUrl ?? ""} onChange={(e) => setForm(f => ({ ...f, imageUrl: e.target.value || null }))} className="mt-1" placeholder="https://..." />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <Button variant="outline" onClick={() => setModal({ open: false, editing: null })}>Cancelar</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving || !form.name.trim() || !form.slug.trim()}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar exclusão */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4">
            <h2 className="font-semibold text-zinc-900">Desativar categoria?</h2>
            <p className="text-sm text-zinc-500">A categoria será desativada e não aparecerá mais no cardápio. Os produtos vinculados continuam existindo.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button className="bg-red-500 hover:bg-red-600" onClick={() => confirmDelete(deleteConfirm)}>Desativar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
