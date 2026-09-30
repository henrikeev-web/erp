"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, Baby, RefreshCw, Star, Edit2, Package, X, Trash2, ImagePlus } from "lucide-react";
import Image from "next/image";
import axios from "axios";
import { formatCurrency, ageLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ProductImage {
  id: string;
  url: string;
  isMain: boolean;
  alt: string | null;
}

interface Product {
  id: string; name: string; description: string | null;
  price: number; priceOriginal: number | null;
  ageMin: number | null; ageMax: number | null;
  featured: boolean; active: boolean; frozen: boolean;
  categoryId: string | null;
  barcode: string | null; ncm: string | null; packWeightG: number | null;
  packLengthCm: number | null; packWidthCm: number | null; packHeightCm: number | null;
  images: ProductImage[];
  category: { id: string; name: string } | null;
  stockItem: { quantity: number; minQuantity: number } | null;
}

interface Category { id: string; name: string }

interface EditForm {
  name: string; description: string; price: string; priceOriginal: string;
  ageMin: string; ageMax: string; categoryId: string;
  featured: boolean; active: boolean; frozen: boolean;
  barcode: string; ncm: string; packWeightG: string;
  packLengthCm: string; packWidthCm: string; packHeightCm: string;
}

const numStr = (v: number | null) => (v !== null && v !== undefined ? String(v) : "");

function productToForm(p: Product): EditForm {
  return {
    name: p.name,
    description: p.description ?? "",
    price: String(p.price),
    priceOriginal: p.priceOriginal !== null ? String(p.priceOriginal) : "",
    ageMin: p.ageMin !== null ? String(p.ageMin) : "",
    ageMax: p.ageMax !== null ? String(p.ageMax) : "",
    categoryId: p.categoryId ?? "",
    featured: p.featured,
    active: p.active,
    frozen: p.frozen,
    barcode: p.barcode ?? "",
    ncm: p.ncm ?? "",
    packWeightG: numStr(p.packWeightG),
    packLengthCm: numStr(p.packLengthCm),
    packWidthCm: numStr(p.packWidthCm),
    packHeightCm: numStr(p.packHeightCm),
  };
}

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "low">("all");
  const [catFilter, setCatFilter] = useState<string>("all");

  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [modalImages, setModalImages] = useState<ProductImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/produtos?brand=banguelas&includeInactive=true");
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    axios.get("/api/categorias?includeInactive=true").then(r => setCategories(r.data)).catch(() => {});
  }, []);

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "active" && !p.active) return false;
    if (filter === "low" && (p.stockItem === null || p.stockItem.quantity > p.stockItem.minQuantity)) return false;
    if (catFilter !== "all" && p.categoryId !== catFilter) return false;
    return true;
  });

  // Group by category for the display
  const grouped: { category: Category | null; products: Product[] }[] = catFilter !== "all"
    ? [{ category: categories.find(c => c.id === catFilter) ?? null, products: filtered }]
    : (() => {
        const result: { category: Category | null; products: Product[] }[] = [];
        for (const cat of categories) {
          const catProds = filtered.filter(p => p.categoryId === cat.id);
          if (catProds.length > 0) result.push({ category: cat, products: catProds });
        }
        const uncategorized = filtered.filter(p => !p.categoryId);
        if (uncategorized.length > 0) result.push({ category: null, products: uncategorized });
        return result;
      })();

  async function toggleFeatured(id: string, current: boolean) {
    await axios.put(`/api/produtos/${id}`, { featured: !current });
    load();
  }

  async function toggleActive(id: string, current: boolean) {
    await axios.put(`/api/produtos/${id}`, { active: !current });
    load();
  }

  async function handleDelete(product: Product) {
    if (!window.confirm(`Excluir "${product.name}"?\n\nO produto será desativado e ficará oculto no cardápio.`)) return;
    await axios.delete(`/api/produtos/${product.id}`);
    load();
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm(productToForm(p));
    setModalImages(p.images);
  }

  function closeEdit() {
    setEditProduct(null);
    setForm(null);
    setModalImages([]);
  }

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm(prev => prev ? { ...prev, [key]: value } : prev);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editProduct) return;

    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data: upload } = await axios.post("/api/upload", fd);

      const isFirst = modalImages.length === 0;
      const { data: img } = await axios.post(`/api/produtos/${editProduct.id}/imagens`, {
        url: upload.url,
        isMain: isFirst,
      });

      setModalImages(prev => isFirst ? [img] : [...prev, img]);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      alert(msg ?? "Erro ao fazer upload da imagem.");
    } finally {
      setUploadingImg(false);
      e.target.value = "";
    }
  }

  async function setImageMain(imgId: string) {
    if (!editProduct) return;
    await axios.patch(`/api/produtos/${editProduct.id}/imagens/${imgId}`, { isMain: true });
    setModalImages(prev => prev.map(img => ({ ...img, isMain: img.id === imgId })));
  }

  async function deleteImage(imgId: string) {
    if (!editProduct) return;
    const target = modalImages.find(img => img.id === imgId);
    await axios.delete(`/api/produtos/${editProduct.id}/imagens/${imgId}`);

    const remaining = modalImages.filter(img => img.id !== imgId);
    if (target?.isMain && remaining.length > 0) {
      await axios.patch(`/api/produtos/${editProduct.id}/imagens/${remaining[0].id}`, { isMain: true });
      setModalImages(remaining.map((img, i) => ({ ...img, isMain: i === 0 })));
    } else {
      setModalImages(remaining);
    }
  }

  async function saveEdit() {
    if (!editProduct || !form) return;
    setSaving(true);
    try {
      await axios.put(`/api/produtos/${editProduct.id}`, {
        name: form.name,
        description: form.description || null,
        price: parseFloat(form.price),
        priceOriginal: form.priceOriginal ? parseFloat(form.priceOriginal) : null,
        ageMin: form.ageMin ? parseInt(form.ageMin) : null,
        ageMax: form.ageMax ? parseInt(form.ageMax) : null,
        categoryId: form.categoryId || null,
        featured: form.featured,
        active: form.active,
        frozen: form.frozen,
        barcode: form.barcode,
        ncm: form.ncm,
        packWeightG: form.packWeightG,
        packLengthCm: form.packLengthCm,
        packWidthCm: form.packWidthCm,
        packHeightCm: form.packHeightCm,
      });
      closeEdit();
      load();
    } catch (err) {
      // Erros de validação (EAN/NCM inválidos, duplicado) vêm com mensagem em português
      alert(axios.isAxiosError(err) && err.response?.data?.error ? err.response.data.error : "Erro ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Produtos</h1>
          <p className="text-zinc-500 text-sm">{filtered.length} de {products.length} produto{products.length !== 1 ? "s" : ""}</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" /> Novo produto
        </Button>
      </div>

      <div className="space-y-3">
        {/* Search + status filter */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto..." className="pl-9" />
          </div>
          <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
            {[
              { value: "all", label: "Todos" },
              { value: "active", label: "Ativos" },
              { value: "low", label: "Estoque baixo" },
            ].map((f) => (
              <button key={f.value} onClick={() => setFilter(f.value as typeof filter)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === f.value ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setCatFilter("all")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${catFilter === "all" ? "bg-orange-500 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}
          >
            Todas as categorias
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCatFilter(cat.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${catFilter === cat.id ? "bg-orange-500 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          {filtered.length === 0 && (
            <p className="text-sm text-zinc-400 px-6 py-8 text-center">Nenhum produto encontrado</p>
          )}

          {grouped.map(({ category, products: catProds }) => (
            <div key={category?.id ?? "__sem-cat__"}>
              {/* Category header — only shown when viewing all */}
              {catFilter === "all" && (
                <div className="px-5 py-2.5 bg-zinc-50 border-b border-t border-zinc-100 flex items-center gap-2 sticky top-0 z-10">
                  <span className="text-xs font-bold text-zinc-600 uppercase tracking-wide">
                    {category?.name ?? "Sem categoria"}
                  </span>
                  <span className="text-xs text-zinc-400 font-medium">({catProds.length})</span>
                </div>
              )}

              <div className="divide-y divide-zinc-50">
                {catProds.map((product) => {
                  const mainImg = product.images.find(i => i.isMain)?.url ?? product.images[0]?.url;
                  const lowStock = product.stockItem && product.stockItem.quantity <= product.stockItem.minQuantity;

                  return (
                    <div key={product.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="w-14 h-14 rounded-xl bg-orange-50 overflow-hidden shrink-0">
                        {mainImg ? (
                          <Image src={mainImg} alt={product.name} width={56} height={56} className="object-cover w-full h-full" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Baby className="w-6 h-6 text-orange-200" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-zinc-900">{product.name}</p>
                          {!product.active && <Badge variant="secondary">Inativo</Badge>}
                          {product.featured && <Badge variant="warning" className="bg-yellow-100 text-yellow-700">Destaque</Badge>}
                          {lowStock && <Badge className="bg-red-100 text-red-700">Estoque baixo</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {product.category && catFilter === "all" && (
                            <span className="text-xs text-zinc-400">{product.category.name}</span>
                          )}
                          {(product.ageMin !== null || product.ageMax !== null) && (
                            <span className="text-xs text-orange-500 flex items-center gap-1">
                              <Baby className="w-3 h-3" />
                              {product.ageMin ? ageLabel(product.ageMin) : ""}
                              {product.ageMax ? `–${ageLabel(product.ageMax)}` : "+"}
                            </span>
                          )}
                          {product.stockItem && (
                            <span className={`text-xs flex items-center gap-1 ${lowStock ? "text-red-500" : "text-zinc-400"}`}>
                              <Package className="w-3 h-3" /> {product.stockItem.quantity} un
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right mr-3">
                        <p className="font-bold text-zinc-900">{formatCurrency(product.price)}</p>
                        {product.priceOriginal && (
                          <p className="text-xs text-zinc-400 line-through">{formatCurrency(product.priceOriginal)}</p>
                        )}
                      </div>

                      <div className="shrink-0 flex gap-1.5">
                        <button onClick={() => toggleFeatured(product.id, product.featured)}
                          title={product.featured ? "Remover destaque" : "Marcar destaque"}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${product.featured ? "bg-yellow-100 text-yellow-600" : "bg-zinc-100 text-zinc-400 hover:text-yellow-500"}`}>
                          <Star className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleActive(product.id, product.active)}
                          title={product.active ? "Desativar produto" : "Ativar produto"}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${product.active ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600" : "bg-zinc-100 text-zinc-500 hover:bg-green-100 hover:text-green-600"}`}>
                          {product.active ? "Ativo" : "Inativo"}
                        </button>
                        <button onClick={() => openEdit(product)}
                          title="Editar produto"
                          className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-500 hover:bg-orange-100 hover:text-orange-600 flex items-center justify-center transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(product)}
                          title="Excluir produto"
                          className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editProduct && form && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeEdit}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h2 className="font-semibold text-zinc-900">Editar produto</h2>
              <button onClick={closeEdit} className="w-7 h-7 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[65vh]">

              {/* Images */}
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-2 block">Fotos do produto</label>
                <div className="flex flex-wrap gap-2">
                  {modalImages.map(img => (
                    <div key={img.id} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50">
                      <Image src={img.url} alt={img.alt ?? ""} width={80} height={80} className="object-cover w-full h-full" unoptimized />
                      {img.isMain && (
                        <div className="absolute top-1 left-1 bg-orange-500 rounded-full p-0.5 pointer-events-none">
                          <Star className="w-2.5 h-2.5 text-white fill-white" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                        {!img.isMain && (
                          <button onClick={() => setImageMain(img.id)} title="Tornar foto principal"
                            className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow hover:bg-orange-50">
                            <Star className="w-3.5 h-3.5 text-orange-500" />
                          </button>
                        )}
                        <button onClick={() => deleteImage(img.id)} title="Remover foto"
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingImg}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-zinc-200 hover:border-orange-300 flex flex-col items-center justify-center transition-colors text-zinc-400 hover:text-orange-500 disabled:opacity-50">
                    {uploadingImg
                      ? <RefreshCw className="w-5 h-5 animate-spin" />
                      : <><ImagePlus className="w-5 h-5" /><span className="text-xs mt-1">Adicionar</span></>
                    }
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageUpload} />
                </div>
                {modalImages.length > 0 && (
                  <p className="text-xs text-zinc-400 mt-1.5">Passe o mouse sobre a foto para definir como principal ou remover.</p>
                )}
              </div>

              <div className="border-t border-zinc-100" />

              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Nome *</label>
                <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Nome do produto" />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setField("description", e.target.value)}
                  placeholder="Descrição do produto"
                  rows={2}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Preço (R$) *</label>
                  <Input type="number" step="0.01" min="0" value={form.price} onChange={e => setField("price", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Preço original (R$)</label>
                  <Input type="number" step="0.01" min="0" value={form.priceOriginal} onChange={e => setField("priceOriginal", e.target.value)} placeholder="Opcional" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Categoria</label>
                <select
                  value={form.categoryId}
                  onChange={e => setField("categoryId", e.target.value)}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                >
                  <option value="">Sem categoria</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Idade mínima (meses)</label>
                  <Input type="number" min="0" value={form.ageMin} onChange={e => setField("ageMin", e.target.value)} placeholder="Ex: 6" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Idade máxima (meses)</label>
                  <Input type="number" min="0" value={form.ageMax} onChange={e => setField("ageMax", e.target.value)} placeholder="Ex: 24" />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-zinc-700">Dados internos</p>
                  <p className="text-[11px] text-zinc-500">Uso interno (logística e fiscal). Não aparecem no cardápio.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Código de barras (EAN)</label>
                    <Input inputMode="numeric" value={form.barcode} onChange={e => setField("barcode", e.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="7891234567895" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-600 mb-1.5 block">NCM</label>
                    <Input inputMode="numeric" value={form.ncm} onChange={e => setField("ncm", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8 dígitos" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Peso emb. (g)</label>
                    <Input type="number" min="0" value={form.packWeightG} onChange={e => setField("packWeightG", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Compr. (cm)</label>
                    <Input type="number" min="0" step="0.1" value={form.packLengthCm} onChange={e => setField("packLengthCm", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Larg. (cm)</label>
                    <Input type="number" min="0" step="0.1" value={form.packWidthCm} onChange={e => setField("packWidthCm", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Alt. (cm)</label>
                    <Input type="number" min="0" step="0.1" value={form.packHeightCm} onChange={e => setField("packHeightCm", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex gap-5 pt-1">
                {(["active", "featured", "frozen"] as const).map((key) => {
                  const labels = { active: "Ativo", featured: "Destaque", frozen: "Congelado" };
                  return (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <button
                        type="button"
                        onClick={() => setField(key, !form[key])}
                        className={`w-10 h-5 rounded-full transition-colors relative ${form[key] ? "bg-orange-500" : "bg-zinc-200"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form[key] ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                      <span className="text-sm text-zinc-700">{labels[key]}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-2">
              <Button variant="outline" onClick={closeEdit} disabled={saving}>Cancelar</Button>
              <Button
                onClick={saveEdit}
                disabled={saving || !form.name || !form.price}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />Salvando…</> : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
