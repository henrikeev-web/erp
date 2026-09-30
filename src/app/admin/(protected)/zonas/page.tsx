"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { MapPin, Plus, Trash2, Save, X, RefreshCw, Edit2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "next-auth/react";

interface Zone {
  id: string; name: string; fee: number; freeAbove: number | null; minOrder: number;
  estimatedMin: number; estimatedMax: number; active: boolean;
  neighborhoods: string[]; cities: string[]; maxRadiusKm: number | null;
  courierFee?: number; // só vem para administradores
}

const EMPTY_ZONE = {
  name: "", fee: "", freeAbove: "", minOrder: "0",
  estimatedMin: "30", estimatedMax: "60",
  neighborhoods: "", cities: "São José do Rio Preto",
  maxRadiusKm: "",
  courierFee: "",
};

export default function ZonasPage() {
  const { data: session } = useSession();
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(session?.user?.role ?? "");
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_ZONE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/zonas-entrega", { params: { todas: true } });
      setZones(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(zone: Zone) {
    setEditingId(zone.id);
    setForm({
      name: zone.name,
      fee: String(zone.fee),
      freeAbove: zone.freeAbove != null ? String(zone.freeAbove) : "",
      minOrder: String(zone.minOrder),
      estimatedMin: String(zone.estimatedMin),
      estimatedMax: String(zone.estimatedMax),
      neighborhoods: zone.neighborhoods.join(", "),
      cities: zone.cities.join(", "),
      maxRadiusKm: zone.maxRadiusKm != null ? String(zone.maxRadiusKm) : "",
      courierFee: zone.courierFee != null ? String(zone.courierFee) : "",
    });
    setShowForm(true);
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_ZONE);
    setShowForm(true);
  }

  async function save() {
    if (!form.name || !form.fee) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        fee: parseFloat(form.fee),
        freeAbove: form.freeAbove ? parseFloat(form.freeAbove) : null,
        minOrder: parseFloat(form.minOrder || "0"),
        estimatedMin: parseInt(form.estimatedMin || "30"),
        estimatedMax: parseInt(form.estimatedMax || "60"),
        neighborhoods: form.neighborhoods.split(",").map(s => s.trim()).filter(Boolean),
        cities: form.cities.split(",").map(s => s.trim()).filter(Boolean),
        maxRadiusKm: form.maxRadiusKm ? parseFloat(form.maxRadiusKm) : null,
        // Custo do entregador: só administrador envia (o servidor recusa de outros perfis)
        ...(isAdmin && form.courierFee !== "" ? { courierFee: parseFloat(form.courierFee) } : {}),
        active: true,
      };
      if (editingId) {
        await axios.patch(`/api/zonas-entrega/${editingId}`, payload);
      } else {
        await axios.post("/api/zonas-entrega", payload);
      }
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(id: string) {
    if (!confirm("Excluir esta zona de entrega?")) return;
    await axios.patch(`/api/zonas-entrega/${id}`, { active: false });
    load();
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Zonas de Entrega</h1>
          <p className="text-zinc-500 text-sm">{zones.length} zona{zones.length !== 1 ? "s" : ""} ativa{zones.length !== 1 ? "s" : ""}</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={startCreate}>
          <Plus className="w-4 h-4 mr-2" /> Nova zona
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : zones.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <MapPin className="w-12 h-12 mx-auto mb-3 text-zinc-200" />
          <p>Nenhuma zona cadastrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-white rounded-2xl border border-zinc-100 p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-zinc-900">{zone.name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500 mt-1">
                    <span className="font-medium text-zinc-700">Taxa: {formatCurrency(zone.fee)}</span>
                    {isAdmin && zone.courierFee != null && <span className="text-amber-700">🛵 Entregador: {formatCurrency(zone.courierFee)}</span>}
                    {zone.maxRadiusKm != null && <span className="text-blue-600 font-medium">📍 Até {zone.maxRadiusKm} km</span>}
                    {zone.freeAbove && <span>Grátis acima de {formatCurrency(zone.freeAbove)}</span>}
                    {zone.minOrder > 0 && <span>Pedido mín: {formatCurrency(zone.minOrder)}</span>}
                    <span>Entrega: {zone.estimatedMin}–{zone.estimatedMax} min</span>
                  </div>
                  {zone.neighborhoods.length > 0 && (
                    <p className="text-xs text-zinc-400 mt-1.5">
                      Bairros: {zone.neighborhoods.slice(0, 5).join(", ")}{zone.neighborhoods.length > 5 && ` +${zone.neighborhoods.length - 5}`}
                    </p>
                  )}
                  {zone.cities.length > 0 && (
                    <p className="text-xs text-zinc-400">Cidades: {zone.cities.join(", ")}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEdit(zone)} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteZone(zone.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-zinc-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 my-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">{editingId ? "Editar zona" : "Nova zona de entrega"}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500">Nome da zona *</label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" placeholder="Ex: SP - Vila Mariana / Moema" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Taxa de entrega (R$) *</label>
                  <Input type="number" step="0.01" value={form.fee} onChange={(e) => setForm(f => ({ ...f, fee: e.target.value }))} className="mt-1" placeholder="8.00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Frete grátis acima de (R$)</label>
                  <Input type="number" step="0.01" value={form.freeAbove} onChange={(e) => setForm(f => ({ ...f, freeAbove: e.target.value }))} className="mt-1" placeholder="80.00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Pedido mínimo (R$)</label>
                  <Input type="number" step="0.01" value={form.minOrder} onChange={(e) => setForm(f => ({ ...f, minOrder: e.target.value }))} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-zinc-500">Tempo mín (min)</label>
                    <Input type="number" value={form.estimatedMin} onChange={(e) => setForm(f => ({ ...f, estimatedMin: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-500">Tempo máx</label>
                    <Input type="number" value={form.estimatedMax} onChange={(e) => setForm(f => ({ ...f, estimatedMax: e.target.value }))} className="mt-1" />
                  </div>
                </div>
              </div>
              {isAdmin && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <label className="text-xs font-semibold text-amber-900">Custo do entregador por entrega (R$)</label>
                  <Input type="number" step="0.01" min="0" value={form.courierFee} onChange={(e) => setForm(f => ({ ...f, courierFee: e.target.value }))} className="mt-1 bg-white" placeholder="Ex: 6.00" />
                  <p className="text-[11px] text-amber-800 mt-1">Quanto o entregador recebe por entrega nesta região. Já vem incluído na taxa cobrada do cliente. Interno: o cliente não vê. É gravado no pedido ao escolher o entregador, então mudar aqui não altera entregas passadas.</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-zinc-500">Raio máximo (km) — deixe vazio para usar bairros/cidades</label>
                <Input type="number" step="0.5" min="0" value={form.maxRadiusKm} onChange={(e) => setForm(f => ({ ...f, maxRadiusKm: e.target.value }))} className="mt-1" placeholder="Ex: 5 → atende até 5km do CD" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Bairros atendidos (separados por vírgula)</label>
                <textarea
                  value={form.neighborhoods}
                  onChange={(e) => setForm(f => ({ ...f, neighborhoods: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-zinc-200 rounded-xl text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                  placeholder="Centro, Vila Mariana, Moema, Ibirapuera"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Cidades (separadas por vírgula)</label>
                <Input value={form.cities} onChange={(e) => setForm(f => ({ ...f, cities: e.target.value }))} className="mt-1" placeholder="São Paulo" />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving || !form.name || !form.fee}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                {editingId ? "Salvar" : "Criar zona"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
