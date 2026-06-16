"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Settings, Save, RefreshCw, Baby, Palette, Info, Image, X, Plus, Trash2, GripVertical, Link, Monitor, Smartphone, ArrowUp, ArrowDown, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Brand {
  id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string;
}

interface BannerSlide {
  id: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  linkUrl: string | null;
  order: number;
  active: boolean;
}

interface NewSlideForm {
  desktopImageUrl: string;
  mobileImageUrl: string;
  linkUrl: string;
  order: number;
  active: boolean;
}

interface CategoryItem {
  id: string;
  name: string;
  order: number;
  active: boolean;
}

export default function ConfiguracoesPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: "", primaryColor: "#f97316" });
  const [slides, setSlides] = useState<BannerSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingSlide, setAddingSlide] = useState(false);
  const [newSlide, setNewSlide] = useState<NewSlideForm>({ desktopImageUrl: "", mobileImageUrl: "", linkUrl: "", order: 0, active: true });
  const [uploadingDesktop, setUploadingDesktop] = useState(false);
  const [uploadingMobile, setUploadingMobile] = useState(false);
  const [uploadingDesktopFor, setUploadingDesktopFor] = useState<string | null>(null);
  const [uploadingMobileFor, setUploadingMobileFor] = useState<string | null>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const [catOrderList, setCatOrderList] = useState<CategoryItem[]>([]);
  const [catOrderMode, setCatOrderMode] = useState<"alpha" | "custom">("custom");
  const [savingCatOrder, setSavingCatOrder] = useState(false);
  const [catOrderSaved, setCatOrderSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get("/api/configuracoes"),
      axios.get("/api/banner-slides"),
      axios.get("/api/categorias?includeInactive=true"),
    ]).then(([brandRes, slidesRes, catsRes]) => {
      setBrand(brandRes.data);
      setForm({ name: brandRes.data.name, primaryColor: brandRes.data.primaryColor });
      setSlides(slidesRes.data);
      setCatOrderList([...catsRes.data].sort((a: CategoryItem, b: CategoryItem) => a.order - b.order));
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!brand) return;
    setSaving(true);
    try {
      await axios.put("/api/configuracoes", form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, type: "desktop" | "mobile"): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await axios.post(`/api/upload-banner?type=${type}`, fd);
    return data.url;
  }

  async function handleNewDesktop(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDesktop(true);
    try {
      const url = await uploadImage(file, "desktop");
      setNewSlide(s => ({ ...s, desktopImageUrl: url }));
    } finally {
      setUploadingDesktop(false);
    }
  }

  async function handleNewMobile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMobile(true);
    try {
      const url = await uploadImage(file, "mobile");
      setNewSlide(s => ({ ...s, mobileImageUrl: url }));
    } finally {
      setUploadingMobile(false);
    }
  }

  async function saveNewSlide() {
    if (!newSlide.desktopImageUrl || !newSlide.mobileImageUrl) return;
    const { data } = await axios.post("/api/banner-slides", {
      ...newSlide,
      linkUrl: newSlide.linkUrl || null,
      order: slides.length,
    });
    setSlides(s => [...s, data]);
    setNewSlide({ desktopImageUrl: "", mobileImageUrl: "", linkUrl: "", order: 0, active: true });
    setAddingSlide(false);
  }

  async function deleteSlide(id: string) {
    await axios.delete(`/api/banner-slides/${id}`);
    setSlides(s => s.filter(sl => sl.id !== id));
  }

  async function toggleSlideActive(slide: BannerSlide) {
    const { data } = await axios.patch(`/api/banner-slides/${slide.id}`, { active: !slide.active });
    setSlides(s => s.map(sl => sl.id === slide.id ? data : sl));
  }

  async function replaceImage(slideId: string, type: "desktop" | "mobile", file: File) {
    if (type === "desktop") setUploadingDesktopFor(slideId);
    else setUploadingMobileFor(slideId);
    try {
      const url = await uploadImage(file, type);
      const field = type === "desktop" ? "desktopImageUrl" : "mobileImageUrl";
      const { data } = await axios.patch(`/api/banner-slides/${slideId}`, { [field]: url });
      setSlides(s => s.map(sl => sl.id === slideId ? data : sl));
    } finally {
      if (type === "desktop") setUploadingDesktopFor(null);
      else setUploadingMobileFor(null);
    }
  }

  async function updateSlideLink(slideId: string, linkUrl: string) {
    const { data } = await axios.patch(`/api/banner-slides/${slideId}`, { linkUrl: linkUrl || null });
    setSlides(s => s.map(sl => sl.id === slideId ? data : sl));
  }

  function moveCat(idx: number, dir: -1 | 1) {
    const newList = [...catOrderList];
    const swap = idx + dir;
    if (swap < 0 || swap >= newList.length) return;
    [newList[idx], newList[swap]] = [newList[swap], newList[idx]];
    setCatOrderList(newList);
  }

  async function applyAlpha() {
    const sorted = [...catOrderList].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
    setSavingCatOrder(true);
    try {
      await Promise.all(sorted.map((c, i) => axios.patch(`/api/categorias/${c.id}`, { order: i })));
      setCatOrderList(sorted.map((c, i) => ({ ...c, order: i })));
      setCatOrderSaved(true);
      setTimeout(() => setCatOrderSaved(false), 3000);
    } finally {
      setSavingCatOrder(false);
    }
  }

  async function saveCatOrder() {
    setSavingCatOrder(true);
    try {
      await Promise.all(catOrderList.map((c, i) => axios.patch(`/api/categorias/${c.id}`, { order: i })));
      setCatOrderList(catOrderList.map((c, i) => ({ ...c, order: i })));
      setCatOrderSaved(true);
      setTimeout(() => setCatOrderSaved(false), 3000);
    } finally {
      setSavingCatOrder(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center">
          <Settings className="w-5 h-5 text-zinc-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Configurações</h1>
          <p className="text-zinc-500 text-sm">Configurações gerais da loja</p>
        </div>
      </div>

      {/* Marca */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
          <Baby className="w-4 h-4" /> Marca
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-500">Nome da loja</label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">Slug (URL)</label>
            <Input value={brand?.slug ?? ""} disabled className="mt-1 opacity-60" />
            <p className="text-xs text-zinc-400 mt-1">O slug não pode ser alterado</p>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" /> Cor primária
            </label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                className="w-10 h-10 rounded-xl border border-zinc-200 cursor-pointer p-0.5"
              />
              <Input value={form.primaryColor} onChange={(e) => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="w-32" placeholder="#f97316" />
              <div className="w-10 h-10 rounded-xl border border-zinc-200" style={{ backgroundColor: form.primaryColor }} />
            </div>
          </div>
        </div>
      </div>

      {/* Banner — Carrossel */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
            <Image className="w-4 h-4" /> Banner do cardápio — Carrossel
          </h2>
          <div className="text-xs text-zinc-400 bg-zinc-50 rounded-lg px-3 py-1.5 leading-relaxed text-right">
            <span className="flex items-center gap-1.5 font-medium text-zinc-500"><Monitor className="w-3 h-3" /> Desktop: 1400 × 480 px</span>
            <span className="flex items-center gap-1.5 font-medium text-zinc-500 mt-0.5"><Smartphone className="w-3 h-3" /> Mobile: 800 × 600 px</span>
          </div>
        </div>

        {/* Lista de slides */}
        <div className="space-y-3">
          {slides.length === 0 && !addingSlide && (
            <div className="text-center py-8 text-zinc-400 text-sm border-2 border-dashed border-zinc-100 rounded-xl">
              Nenhum slide cadastrado. Adicione o primeiro banner abaixo.
            </div>
          )}

          {slides.map((slide, idx) => (
            <div key={slide.id} className={`border rounded-xl p-4 space-y-3 transition-colors ${slide.active ? "border-zinc-100 bg-white" : "border-zinc-100 bg-zinc-50 opacity-60"}`}>
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-zinc-300 flex-none" />
                <span className="text-xs font-semibold text-zinc-400">Slide {idx + 1}</span>
                <div className="flex-1" />
                <button
                  onClick={() => toggleSlideActive(slide)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${slide.active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}
                >
                  {slide.active ? "Ativo" : "Inativo"}
                </button>
                <button onClick={() => deleteSlide(slide.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Imagens */}
              <div className="grid grid-cols-2 gap-3">
                <label className="cursor-pointer group">
                  <div className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5"><Monitor className="w-3 h-3" /> Desktop</div>
                  <div className="relative rounded-xl overflow-hidden bg-zinc-50 border border-zinc-100" style={{ aspectRatio: "1400/480" }}>
                    <img src={slide.desktopImageUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded-lg transition-opacity">
                        {uploadingDesktopFor === slide.id ? "Enviando..." : "Trocar"}
                      </span>
                    </div>
                  </div>
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) replaceImage(slide.id, "desktop", f); }} />
                </label>

                <label className="cursor-pointer group">
                  <div className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5"><Smartphone className="w-3 h-3" /> Mobile</div>
                  <div className="relative rounded-xl overflow-hidden bg-zinc-50 border border-zinc-100" style={{ aspectRatio: "800/600" }}>
                    <img src={slide.mobileImageUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded-lg transition-opacity">
                        {uploadingMobileFor === slide.id ? "Enviando..." : "Trocar"}
                      </span>
                    </div>
                  </div>
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) replaceImage(slide.id, "mobile", f); }} />
                </label>
              </div>

              {/* Link */}
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5"><Link className="w-3 h-3" /> Link (opcional)</label>
                <Input
                  defaultValue={slide.linkUrl ?? ""}
                  placeholder="ex: /cardapio?age=6 ou #categoria-slug"
                  className="text-sm"
                  onBlur={(e) => updateSlideLink(slide.id, e.target.value)}
                />
              </div>
            </div>
          ))}

          {/* Formulário de novo slide */}
          {addingSlide && (
            <div className="border-2 border-orange-200 bg-orange-50/50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-zinc-700">Novo slide</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5"><Monitor className="w-3 h-3" /> Desktop (1400×480)</div>
                  {newSlide.desktopImageUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-zinc-100" style={{ aspectRatio: "1400/480" }}>
                      <img src={newSlide.desktopImageUrl} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setNewSlide(s => ({ ...s, desktopImageUrl: "" }))} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white hover:border-orange-300 transition-colors flex items-center justify-center text-zinc-400 text-xs" style={{ aspectRatio: "1400/480" }}>
                        {uploadingDesktop ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Selecionar</>}
                      </div>
                      <input ref={desktopInputRef} type="file" accept="image/*" className="sr-only" onChange={handleNewDesktop} />
                    </label>
                  )}
                </div>

                <div>
                  <div className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5"><Smartphone className="w-3 h-3" /> Mobile (800×600)</div>
                  {newSlide.mobileImageUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-zinc-100" style={{ aspectRatio: "800/600" }}>
                      <img src={newSlide.mobileImageUrl} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setNewSlide(s => ({ ...s, mobileImageUrl: "" }))} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white hover:border-orange-300 transition-colors flex items-center justify-center text-zinc-400 text-xs" style={{ aspectRatio: "800/600" }}>
                        {uploadingMobile ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Selecionar</>}
                      </div>
                      <input ref={mobileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleNewMobile} />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5"><Link className="w-3 h-3" /> Link (opcional)</label>
                <Input
                  value={newSlide.linkUrl}
                  onChange={(e) => setNewSlide(s => ({ ...s, linkUrl: e.target.value }))}
                  placeholder="ex: /cardapio?age=6 ou #categoria-slug"
                  className="text-sm"
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" size="sm" onClick={() => { setAddingSlide(false); setNewSlide({ desktopImageUrl: "", mobileImageUrl: "", linkUrl: "", order: 0, active: true }); }}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600"
                  onClick={saveNewSlide}
                  disabled={!newSlide.desktopImageUrl || !newSlide.mobileImageUrl}
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Adicionar slide
                </Button>
              </div>
            </div>
          )}
        </div>

        {!addingSlide && (
          <Button variant="outline" className="w-full border-dashed" onClick={() => setAddingSlide(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Adicionar slide
          </Button>
        )}
      </div>

      {/* Categorias — Ordenação */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
            <List className="w-4 h-4" /> Categorias — Ordem no cardápio
          </h2>
          {/* Mode selector */}
          <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
            <button
              onClick={() => setCatOrderMode("custom")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catOrderMode === "custom" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}
            >
              Personalizado
            </button>
            <button
              onClick={() => setCatOrderMode("alpha")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catOrderMode === "alpha" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}
            >
              Alfabético
            </button>
          </div>
        </div>

        {catOrderMode === "alpha" ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">
              Clique em <strong>Aplicar ordem A–Z</strong> para ordenar automaticamente todas as categorias em ordem alfabética.
            </p>
            <div className="border border-zinc-100 rounded-xl divide-y divide-zinc-50">
              {[...catOrderList]
                .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
                .map((cat, idx) => (
                  <div key={cat.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-xs text-zinc-300 font-mono w-5 text-right">{idx + 1}</span>
                    <span className="text-sm text-zinc-700 flex-1">{cat.name}</span>
                    {!cat.active && <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">Inativa</span>}
                  </div>
                ))}
            </div>
            <Button
              onClick={applyAlpha}
              disabled={savingCatOrder}
              className={`w-full ${catOrderSaved ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}
            >
              {savingCatOrder
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> Salvando...</>
                : catOrderSaved
                ? <><Save className="w-4 h-4 mr-1.5" /> Ordem A–Z aplicada!</>
                : "Aplicar ordem A–Z"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">
              Use as setas para reposicionar as categorias. A ordem aqui define como elas aparecem no cardápio para o cliente.
            </p>
            <div className="border border-zinc-100 rounded-xl divide-y divide-zinc-50">
              {catOrderList.map((cat, idx) => (
                <div key={cat.id} className="flex items-center gap-3 px-4 py-2.5 group">
                  <GripVertical className="w-4 h-4 text-zinc-300 flex-none" />
                  <span className="text-xs text-zinc-300 font-mono w-5 text-right">{idx + 1}</span>
                  <span className={`text-sm flex-1 ${cat.active ? "text-zinc-700" : "text-zinc-400"}`}>{cat.name}</span>
                  {!cat.active && <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">Inativa</span>}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveCat(idx, -1)}
                      disabled={idx === 0}
                      className="w-7 h-7 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveCat(idx, 1)}
                      disabled={idx === catOrderList.length - 1}
                      className="w-7 h-7 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={saveCatOrder}
              disabled={savingCatOrder}
              className={`w-full ${catOrderSaved ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}
            >
              {savingCatOrder
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> Salvando...</>
                : catOrderSaved
                ? <><Save className="w-4 h-4 mr-1.5" /> Ordem salva!</>
                : <><Save className="w-4 h-4 mr-1.5" /> Salvar ordem</>}
            </Button>
          </div>
        )}
      </div>

      {/* Link do cardápio */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Link do Cardápio</h2>
        <div className="bg-zinc-50 rounded-xl px-4 py-3 text-sm">
          <p className="text-zinc-500 text-xs mb-1">URL pública do cardápio</p>
          <p className="font-mono text-zinc-700 select-all">
            {typeof window !== "undefined" ? window.location.origin : ""}/cardapio
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium">Próximas configurações</p>
          <p className="mt-1 text-blue-600">Em breve: horários de funcionamento, retirada na loja, integração com WhatsApp, configurações de NFe.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          className={`${saved ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}
          onClick={save}
          disabled={saving}
        >
          {saving ? (
            <><RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> Salvando...</>
          ) : saved ? (
            <><Save className="w-4 h-4 mr-1.5" /> Salvo!</>
          ) : (
            <><Save className="w-4 h-4 mr-1.5" /> Salvar configurações</>
          )}
        </Button>
      </div>
    </div>
  );
}
