"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Star, RefreshCw, Crown, Trophy, Settings, Save, ShoppingBag, Clock, Gift, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TopCustomer {
  id: string; name: string; phone: string;
  loyaltyCard: { points: number; tier: string } | null;
  _count: { orders: number };
}

interface LoyaltyConfig {
  id: string;
  programEnabled: boolean;
  targetOrders: number;
  minOrderValue: number;
  completionPeriodDays: number;
  rewardType: string;
  rewardValue: number;
  rewardValidDays: number;
  minIntervalHours: number;
  onlyDelivery: boolean;
  notCumulativeWithCoupons: boolean;
}

const TIER_COLORS: Record<string, string> = {
  BRONZE: "bg-orange-100 text-orange-700 border-orange-200",
  SILVER: "bg-zinc-100 text-zinc-600 border-zinc-200",
  GOLD: "bg-yellow-100 text-yellow-700 border-yellow-200",
  PLATINUM: "bg-blue-100 text-blue-700 border-blue-200",
};
const TIER_LABELS: Record<string, string> = {
  BRONZE: "Bronze", SILVER: "Prata", GOLD: "Ouro", PLATINUM: "Platina",
};

type Tab = "ranking" | "config";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${value ? "bg-orange-500" : "bg-zinc-200"}`}
    >
      <div className={`w-4 h-4 bg-white rounded-full shadow m-0.5 transition-transform ${value ? "translate-x-5" : ""}`} />
    </div>
  );
}

export default function FidelidadePage() {
  const [tab, setTab] = useState<Tab>("ranking");
  const [customers, setCustomers] = useState<TopCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>("");

  const [configForm, setConfigForm] = useState<Omit<LoyaltyConfig, "id"> | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/clientes?limit=100");
      const withLoyalty = data.customers
        .filter((c: TopCustomer) => c.loyaltyCard && c.loyaltyCard.points > 0)
        .sort((a: TopCustomer, b: TopCustomer) => (b.loyaltyCard?.points ?? 0) - (a.loyaltyCard?.points ?? 0));
      setCustomers(withLoyalty);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(false);
    try {
      const { data } = await axios.get("/api/fidelidade/config");
      setConfigForm({
        programEnabled: data.programEnabled,
        targetOrders: data.targetOrders,
        minOrderValue: data.minOrderValue,
        completionPeriodDays: data.completionPeriodDays,
        rewardType: data.rewardType,
        rewardValue: data.rewardValue,
        rewardValidDays: data.rewardValidDays,
        minIntervalHours: data.minIntervalHours,
        onlyDelivery: data.onlyDelivery,
        notCumulativeWithCoupons: data.notCumulativeWithCoupons,
      });
    } catch {
      setConfigError(true);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    loadConfig();
  }, [loadCustomers, loadConfig]);

  async function saveConfig() {
    if (!configForm) return;
    setSaving(true);
    try {
      await axios.put("/api/fidelidade/config", configForm);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof Omit<LoyaltyConfig, "id">>(key: K, value: Omit<LoyaltyConfig, "id">[K]) {
    setConfigForm(f => f ? { ...f, [key]: value } : f);
  }

  const filtered = tierFilter ? customers.filter(c => c.loyaltyCard?.tier === tierFilter) : customers;
  const tierCounts = customers.reduce<Record<string, number>>((acc, c) => {
    const tier = c.loyaltyCard?.tier ?? "BRONZE";
    acc[tier] = (acc[tier] ?? 0) + 1;
    return acc;
  }, {});
  const tiers = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Programa de Fidelidade</h1>
          <p className="text-zinc-500 text-sm">{customers.length} clientes com pontos</p>
        </div>
        <Button variant="outline" onClick={tab === "ranking" ? loadCustomers : loadConfig} disabled={loading || configLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${(loading || configLoading) ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab("ranking")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === "ranking" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
          <Star className="w-3.5 h-3.5" /> Ranking
        </button>
        <button onClick={() => setTab("config")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === "config" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
          <Settings className="w-3.5 h-3.5" /> Configurações
        </button>
      </div>

      {/* ── RANKING ── */}
      {tab === "ranking" && (
        <>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-orange-800 flex items-center gap-2">
              <Star className="w-4 h-4" /> Como funciona
            </h2>
            <p className="text-sm text-orange-700">
              Clientes ganham pontos a cada pedido entregue. Os pontos acumulados definem o nível do cliente.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {tiers.map((tier) => (
                <div key={tier} className={`rounded-xl border px-3 py-2.5 text-center ${TIER_COLORS[tier]}`}>
                  <p className="text-xs font-bold">{TIER_LABELS[tier]}</p>
                  <p className="text-xs font-semibold mt-1">{tierCounts[tier] ?? 0} clientes</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
            {[{ value: "", label: "Todos" }, ...tiers.map(t => ({ value: t, label: TIER_LABELS[t] }))].map((f) => (
              <button key={f.value} onClick={() => setTierFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tierFilter === f.value ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">Nenhum cliente encontrado</div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
              <div className="divide-y divide-zinc-50">
                {filtered.map((customer, idx) => {
                  const tier = customer.loyaltyCard?.tier ?? "BRONZE";
                  const points = customer.loyaltyCard?.points ?? 0;
                  return (
                    <div key={customer.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 transition-colors">
                      <div className="w-8 shrink-0 text-center">
                        {idx === 0 ? <Crown className="w-5 h-5 text-yellow-500 mx-auto" /> :
                         idx === 1 ? <Trophy className="w-5 h-5 text-zinc-400 mx-auto" /> :
                         idx === 2 ? <Trophy className="w-5 h-5 text-orange-400 mx-auto" /> :
                         <span className="text-sm text-zinc-400 font-medium">{idx + 1}</span>}
                      </div>
                      <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold text-sm shrink-0">
                        {customer.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900">{customer.name}</p>
                        <p className="text-xs text-zinc-400">{customer._count.orders} pedido{customer._count.orders !== 1 ? "s" : ""} · {customer.phone}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${TIER_COLORS[tier]}`}>
                            {TIER_LABELS[tier]}
                          </span>
                          <span className="text-sm font-bold text-zinc-900">{points} pts</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CONFIG ── */}
      {tab === "config" && configLoading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      )}

      {tab === "config" && !configLoading && configError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center space-y-3">
          <p className="text-sm text-red-600 font-medium">Erro ao carregar configurações</p>
          <Button variant="outline" size="sm" onClick={loadConfig}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Tentar novamente
          </Button>
        </div>
      )}

      {tab === "config" && !configLoading && !configError && configForm && (
        <div className="space-y-5">

          {/* Preview do programa */}
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                <Gift className="w-4 h-4" /> Preview do programa atual
              </h2>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${configForm.programEnabled ? "bg-green-100 text-green-700 border-green-200" : "bg-zinc-100 text-zinc-500 border-zinc-200"}`}>
                {configForm.programEnabled ? "Ativo" : "Inativo"}
              </span>
            </div>
            <p className="text-base font-bold text-orange-900">
              A cada {configForm.targetOrders} pedidos acima de R$ {configForm.minOrderValue.toFixed(2).replace(".", ",")} ganhe um desconto de {configForm.rewardType === "FIXED" ? `R$ ${configForm.rewardValue.toFixed(2).replace(".", ",")}` : `${configForm.rewardValue}%`}!
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-orange-700 bg-white border border-orange-100 px-2.5 py-1.5 rounded-lg">
                <Clock className="w-3.5 h-3.5" /> Complete em até {configForm.completionPeriodDays} dias
              </span>
              <span className="flex items-center gap-1.5 text-orange-700 bg-white border border-orange-100 px-2.5 py-1.5 rounded-lg">
                <Gift className="w-3.5 h-3.5" /> Desconto válido por {configForm.rewardValidDays} dias
              </span>
              <span className="flex items-center gap-1.5 text-orange-700 bg-white border border-orange-100 px-2.5 py-1.5 rounded-lg">
                <ShoppingBag className="w-3.5 h-3.5" /> Intervalo mínimo: {configForm.minIntervalHours}h entre pedidos
              </span>
            </div>
          </div>

          {/* Ativar/desativar */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-800">Programa ativo</p>
                <p className="text-xs text-zinc-400 mt-0.5">Liga ou desliga o programa de fidelidade para os clientes</p>
              </div>
              <Toggle value={configForm.programEnabled} onChange={(v) => set("programEnabled", v)} />
            </div>
          </div>

          {/* Regras de participação */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" /> Regras de participação
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-500">Pedidos necessários</label>
                <Input
                  type="number" min={1}
                  value={configForm.targetOrders}
                  onChange={(e) => set("targetOrders", Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-zinc-400 mt-1">Quantos pedidos o cliente precisa fazer</p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Valor mínimo por pedido (R$)</label>
                <Input
                  type="number" min={0} step={1}
                  value={configForm.minOrderValue}
                  onChange={(e) => set("minOrderValue", Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-zinc-400 mt-1">Pedidos abaixo desse valor não contam</p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Prazo para completar (dias)</label>
                <Input
                  type="number" min={1}
                  value={configForm.completionPeriodDays}
                  onChange={(e) => set("completionPeriodDays", Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-zinc-400 mt-1">A partir do 1º pedido válido</p>
              </div>
            </div>
          </div>

          {/* Recompensa */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
              <Gift className="w-4 h-4" /> Recompensa
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-500">Tipo de desconto</label>
                <div className="flex gap-2 mt-1">
                  {[{ v: "FIXED", label: "R$ fixo" }, { v: "PERCENTAGE", label: "%" }].map(({ v, label }) => (
                    <button
                      key={v}
                      onClick={() => set("rewardType", v)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${configForm.rewardType === v ? "bg-orange-500 text-white border-orange-500" : "border-zinc-200 text-zinc-600 hover:border-orange-200"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">
                  Valor do desconto ({configForm.rewardType === "FIXED" ? "R$" : "%"})
                </label>
                <Input
                  type="number" min={0} step={configForm.rewardType === "FIXED" ? 1 : 0.5}
                  value={configForm.rewardValue}
                  onChange={(e) => set("rewardValue", Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Validade do desconto (dias)</label>
                <Input
                  type="number" min={1}
                  value={configForm.rewardValidDays}
                  onChange={(e) => set("rewardValidDays", Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-zinc-400 mt-1">Após completar o programa</p>
              </div>
            </div>
          </div>

          {/* Restrições */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Restrições
            </h2>

            <div className="space-y-4 divide-y divide-zinc-50">
              <div className="flex items-start justify-between gap-4 pt-1">
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-800">Intervalo mínimo entre pedidos</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Pedidos feitos antes desse intervalo não contam para o programa</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number" min={0}
                      value={configForm.minIntervalHours}
                      onChange={(e) => set("minIntervalHours", Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm text-zinc-500">horas</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-4">
                <div>
                  <p className="text-sm font-medium text-zinc-800">Apenas pedidos de Delivery</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Pedidos de retirada não contam para o programa</p>
                </div>
                <Toggle value={configForm.onlyDelivery} onChange={(v) => set("onlyDelivery", v)} />
              </div>

              <div className="flex items-center justify-between gap-4 pt-4">
                <div>
                  <p className="text-sm font-medium text-zinc-800">Não acumula com cupons</p>
                  <p className="text-xs text-zinc-400 mt-0.5">O desconto do programa não pode ser usado junto com outros cupons</p>
                </div>
                <Toggle value={configForm.notCumulativeWithCoupons} onChange={(v) => set("notCumulativeWithCoupons", v)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              className={`${saved ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600"}`}
              onClick={saveConfig}
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
      )}
    </div>
  );
}
