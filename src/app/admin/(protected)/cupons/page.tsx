"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, RefreshCw, Tag, X, Save, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Coupon {
  id: string; code: string; description: string | null; type: string; value: number;
  minOrder: number; maxDiscount: number | null; maxUses: number | null; usedCount: number;
  validFrom: string; validTo: string | null; firstOrderOnly: boolean; active: boolean;
  ageMin: number | null; ageMax: number | null;
  _count: { orders: number };
}

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: "% desconto", FIXED: "R$ desconto", FREE_DELIVERY: "Frete grátis",
};

const EMPTY_FORM = {
  code: "", description: "", type: "PERCENTAGE", value: "", minOrder: "0",
  maxDiscount: "", maxUses: "", validFrom: "", validTo: "",
  firstOrderOnly: false, ageMin: "", ageMax: "",
};

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/cupons");
      setCoupons(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.code || (form.type !== "FREE_DELIVERY" && !form.value)) { setError(form.type === "FREE_DELIVERY" ? "Informe o código do cupom" : "Código e valor são obrigatórios"); return; }
    setSaving(true); setError("");
    try {
      await axios.post("/api/cupons", form.type === "FREE_DELIVERY" ? { ...form, value: 0, maxDiscount: "" } : form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Erro ao criar cupom");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: Coupon) {
    await axios.patch(`/api/cupons/${coupon.id}`, { active: !coupon.active });
    load();
  }

  async function deleteCoupon(id: string) {
    if (!confirm("Excluir este cupom?")) return;
    await axios.delete(`/api/cupons/${id}`);
    load();
  }

  const active = coupons.filter(c => c.active);
  const inactive = coupons.filter(c => !c.active);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Cupons</h1>
          <p className="text-zinc-500 text-sm">{coupons.length} cupom{coupons.length !== 1 ? "s" : ""} · {active.length} ativo{active.length !== 1 ? "s" : ""}</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => { setShowForm(true); setError(""); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo cupom
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : (
        <div className="space-y-4">
          {[...active, ...inactive].map((coupon) => {
            const expired = coupon.validTo && new Date(coupon.validTo) < new Date();
            const exhausted = coupon.maxUses != null && coupon.usedCount >= coupon.maxUses;
            return (
              <div key={coupon.id} className={`bg-white rounded-2xl border p-5 ${!coupon.active ? "opacity-60 border-zinc-100" : "border-zinc-100"}`}>
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                    <Tag className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <code className="text-base font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-lg">{coupon.code}</code>
                      {coupon.active && !expired && !exhausted && <Badge className="bg-green-100 text-green-700 border-0">Ativo</Badge>}
                      {expired && <Badge variant="destructive">Expirado</Badge>}
                      {exhausted && <Badge className="bg-zinc-100 text-zinc-500 border-0">Esgotado</Badge>}
                      {!coupon.active && !expired && !exhausted && <Badge variant="secondary">Desativado</Badge>}
                      {coupon.firstOrderOnly && <Badge className="bg-blue-100 text-blue-700 border-0">1º pedido</Badge>}
                    </div>
                    {coupon.description && <p className="text-sm text-zinc-500 mb-2">{coupon.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                      <span className="font-medium text-zinc-900">
                        {coupon.type === "PERCENTAGE" ? `${coupon.value}% off` :
                         coupon.type === "FIXED" ? `${formatCurrency(coupon.value)} off` :
                         "Frete grátis"}
                      </span>
                      {coupon.minOrder > 0 && <span>Pedido mín: {formatCurrency(coupon.minOrder)}</span>}
                      {coupon.maxDiscount && <span>Máx desconto: {formatCurrency(coupon.maxDiscount)}</span>}
                      {coupon.ageMin != null && <span>Bebê: {coupon.ageMin}–{coupon.ageMax ?? "∞"}m</span>}
                      {coupon.validTo && <span>Válido até {format(new Date(coupon.validTo), "dd/MM/yy", { locale: ptBR })}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-zinc-900">{coupon.usedCount} uso{coupon.usedCount !== 1 ? "s" : ""}</p>
                    {coupon.maxUses && <p className="text-xs text-zinc-400">de {coupon.maxUses}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleActive(coupon)} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors">
                      {coupon.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => deleteCoupon(coupon.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-zinc-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {coupons.length === 0 && (
            <div className="text-center py-16 text-zinc-400">Nenhum cupom cadastrado</div>
          )}
        </div>
      )}

      {/* Modal criar cupom */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setForm(EMPTY_FORM); } }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 my-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">Novo cupom</h2>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500">Código *</label>
                <Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="mt-1 uppercase" placeholder="EXEMPLO10" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500">Descrição</label>
                <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" placeholder={form.type === "FREE_DELIVERY" ? "Ex: Frete grátis em pedidos acima de R$ 100" : "Ex: 10% de desconto no primeiro pedido"} />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Tipo *</label>
                <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400">
                  <option value="PERCENTAGE">Porcentagem (%)</option>
                  <option value="FIXED">Valor fixo (R$)</option>
                  <option value="FREE_DELIVERY">Frete grátis</option>
                </select>
              </div>
              {form.type !== "FREE_DELIVERY" && (
                <div>
                  <label className="text-xs font-medium text-zinc-500">Valor * {form.type === "PERCENTAGE" ? "(%)" : "(R$)"}</label>
                  <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))} className="mt-1" placeholder={form.type === "PERCENTAGE" ? "10" : "15.00"} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-zinc-500">Pedido mínimo (R$)</label>
                <Input type="number" step="0.01" value={form.minOrder} onChange={(e) => setForm(f => ({ ...f, minOrder: e.target.value }))} className="mt-1" />
              </div>
              {form.type === "PERCENTAGE" && (
                <div>
                  <label className="text-xs font-medium text-zinc-500">Desconto máximo (R$)</label>
                  <Input type="number" step="0.01" value={form.maxDiscount} onChange={(e) => setForm(f => ({ ...f, maxDiscount: e.target.value }))} className="mt-1" placeholder="Sem limite" />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-zinc-500">Máx. usos</label>
                <Input type="number" value={form.maxUses} onChange={(e) => setForm(f => ({ ...f, maxUses: e.target.value }))} className="mt-1" placeholder="Ilimitado" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Válido de</label>
                <Input type="date" value={form.validFrom} onChange={(e) => setForm(f => ({ ...f, validFrom: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Válido até</label>
                <Input type="date" value={form.validTo} onChange={(e) => setForm(f => ({ ...f, validTo: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Idade mín. bebê (meses)</label>
                <Input type="number" value={form.ageMin} onChange={(e) => setForm(f => ({ ...f, ageMin: e.target.value }))} className="mt-1" placeholder="Qualquer" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Idade máx. bebê (meses)</label>
                <Input type="number" value={form.ageMax} onChange={(e) => setForm(f => ({ ...f, ageMax: e.target.value }))} className="mt-1" placeholder="Qualquer" />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm(f => ({ ...f, firstOrderOnly: e.target.checked }))}
                    className="w-4 h-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-500" />
                  <span className="text-sm text-zinc-700">Apenas para primeiro pedido</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>Cancelar</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={create} disabled={saving}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                Criar cupom
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
