"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  School, Users, FileText, Plus, RefreshCw, Save, X, Pencil,
  ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, ExternalLink,
  Send, Layers, Settings, ShieldCheck, ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchoolParent {
  id: string;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  schoolName: string | null;
  childName: string | null;
  monthlyFee: number;
  dueDay: number;
  active: boolean;
  notes: string | null;
  _count: { invoices: number };
}

interface Invoice {
  id: string;
  referenceMonth: number;
  referenceYear: number;
  amount: number;
  status: string;
  rpsNumber: number | null;
  nfseNumber: string | null;
  nfseLink: string | null;
  nfseIssuedAt: string | null;
  nfseError: string | null;
  schoolParent: {
    id: string;
    name: string;
    cpf: string | null;
    email: string | null;
    phone: string | null;
    childName: string | null;
    schoolName: string | null;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente", ISSUED: "Emitida", ERROR: "Erro", CANCELLED: "Cancelada",
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-600",
  ISSUED: "bg-green-100 text-green-700",
  ERROR: "bg-red-100 text-red-700",
  CANCELLED: "bg-zinc-200 text-zinc-500",
};

const EMPTY_FORM = {
  name: "", cpf: "", email: "", phone: "",
  schoolName: "", childName: "", monthlyFee: "", dueDay: "10", notes: "",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface NfseConfig {
  cnpj: string;
  im: string;
  razaoSocial: string;
  itemServico: string;
  codTributacao: string;
  aliquotaIss: number;
  ambiente: string;
  wsUrl: string;
  wsHomologUrl: string;
}

type Tab = "pais" | "mensalidades" | "config";

export default function EscolaPage() {
  const [tab, setTab] = useState<Tab>("pais");

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <School className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Escola</h1>
          <p className="text-zinc-500 text-sm">Pais com mensalidade escolar e emissão de NFS-e</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-xl p-1 w-fit">
        {(["pais", "mensalidades", "config"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t === "pais" ? (
              <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> Pais</span>
            ) : t === "mensalidades" ? (
              <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> Mensalidades</span>
            ) : (
              <span className="flex items-center gap-1.5"><Settings className="w-4 h-4" /> Configurações</span>
            )}
          </button>
        ))}
      </div>

      {tab === "pais" ? <PaisTab /> : tab === "mensalidades" ? <MensalidadesTab /> : <ConfigTab />}
    </div>
  );
}

// ─── Tab: Pais ────────────────────────────────────────────────────────────────

function PaisTab() {
  const [parents, setParents] = useState<SchoolParent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/escola/pais");
      setParents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(p: SchoolParent) {
    setEditId(p.id);
    setForm({
      name: p.name, cpf: p.cpf ?? "", email: p.email ?? "", phone: p.phone ?? "",
      schoolName: p.schoolName ?? "", childName: p.childName ?? "",
      monthlyFee: String(p.monthlyFee), dueDay: String(p.dueDay), notes: p.notes ?? "",
    });
    setFormError("");
    setShowForm(true);
  }

  async function save() {
    if (!form.name || !form.monthlyFee) { setFormError("Nome e mensalidade são obrigatórios"); return; }
    setSaving(true); setFormError("");
    try {
      if (editId) {
        await axios.patch(`/api/escola/pais/${editId}`, form);
      } else {
        await axios.post("/api/escola/pais", form);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setFormError(e.response?.data?.error ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: SchoolParent) {
    await axios.patch(`/api/escola/pais/${p.id}`, { active: !p.active });
    load();
  }

  const active = parents.filter((p) => p.active);
  const inactive = parents.filter((p) => !p.active);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {active.length} ativo{active.length !== 1 ? "s" : ""} · {parents.length} total
        </p>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Novo pai
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : (
        <div className="space-y-3">
          {[...active, ...inactive].map((p) => (
            <div
              key={p.id}
              className={`bg-white rounded-2xl border border-zinc-100 p-5 ${!p.active ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 text-blue-700 font-bold text-sm">
                  {p.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-zinc-900">{p.name}</span>
                    {!p.active && <Badge variant="secondary">Inativo</Badge>}
                    {p.cpf && <span className="text-xs text-zinc-400 font-mono">{p.cpf}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                    {p.childName && <span>Criança: <strong className="text-zinc-700">{p.childName}</strong></span>}
                    {p.schoolName && <span>Escola: {p.schoolName}</span>}
                    {p.phone && <span>{p.phone}</span>}
                    {p.email && <span>{p.email}</span>}
                    <span>Vencimento: dia {p.dueDay}</span>
                    <span>{p._count.invoices} mensalidade{p._count.invoices !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-zinc-900">{formatCurrency(p.monthlyFee)}/mês</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(p)}
                    className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center"
                  >
                    {p.active ? (
                      <ToggleRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-zinc-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {parents.length === 0 && (
            <div className="text-center py-16 text-zinc-400">Nenhum pai cadastrado</div>
          )}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 my-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">
                {editId ? "Editar pai" : "Novo pai"}
              </h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500">Nome completo *</label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1" placeholder="Nome do responsável" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">CPF</label>
                <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} className="mt-1" placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Telefone</label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="mt-1" placeholder="(17) 99999-0000" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500">E-mail</label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="mt-1" placeholder="email@exemplo.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Nome da criança</label>
                <Input value={form.childName} onChange={(e) => setForm((f) => ({ ...f, childName: e.target.value }))} className="mt-1" placeholder="Nome da criança" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Escola</label>
                <Input value={form.schoolName} onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))} className="mt-1" placeholder="Nome da escola" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Mensalidade (R$) *</label>
                <Input type="number" step="0.01" value={form.monthlyFee} onChange={(e) => setForm((f) => ({ ...f, monthlyFee: e.target.value }))} className="mt-1" placeholder="350.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Dia de vencimento</label>
                <Input type="number" min="1" max="28" value={form.dueDay} onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))} className="mt-1" placeholder="10" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500">Observações</label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="mt-1" placeholder="Alergias, turno, etc." />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                {editId ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Tab: Mensalidades ────────────────────────────────────────────────────────

function MensalidadesTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [emittingLote, setEmittingLote] = useState(false);
  const [emittingId, setEmittingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/escola/mensalidades?month=${month}&year=${year}`);
      setInvoices(data);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  }

  async function gerar() {
    if (!confirm(`Gerar mensalidades de ${MONTHS[month]}/${year} para todos os pais ativos?`)) return;
    setGenerating(true);
    try {
      const { data } = await axios.post("/api/escola/mensalidades/gerar", { month, year });
      showToast(`${data.created} gerada(s), ${data.skipped} já existia(m)`, true);
      load();
    } catch (e: any) {
      showToast(e.response?.data?.error ?? "Erro ao gerar", false);
    } finally {
      setGenerating(false);
    }
  }

  async function emitirUma(invoice: Invoice) {
    setEmittingId(invoice.id);
    try {
      const { data } = await axios.post(`/api/escola/mensalidades/${invoice.id}/emitir`);
      showToast(
        data.success
          ? `NFS-e ${data.nfseNumber} emitida para ${invoice.schoolParent.name}`
          : `Erro: ${data.error}`,
        data.success,
      );
      load();
    } catch (e: any) {
      showToast(e.response?.data?.error ?? "Erro ao emitir", false);
    } finally {
      setEmittingId(null);
    }
  }

  async function emitirLote() {
    const pending = invoices.filter((i) => i.status === "PENDING" || i.status === "ERROR");
    if (!pending.length) { showToast("Nenhuma mensalidade pendente", false); return; }
    if (!confirm(`Emitir NFS-e para ${pending.length} mensalidade(s) de ${MONTHS[month]}/${year}?`)) return;
    setEmittingLote(true);
    try {
      const { data } = await axios.post("/api/escola/mensalidades/emitir-lote", { month, year });
      showToast(`${data.issued} emitida(s), ${data.errors} erro(s)`, data.errors === 0);
      load();
    } catch (e: any) {
      showToast(e.response?.data?.error ?? "Erro ao emitir lote", false);
    } finally {
      setEmittingLote(false);
    }
  }

  const issued = invoices.filter((i) => i.status === "ISSUED").length;
  const pending = invoices.filter((i) => i.status === "PENDING" || i.status === "ERROR").length;

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i);

  return (
    <>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={month}
          onChange={(e) => setMonth(parseInt(e.target.value))}
          className="px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
        >
          {MONTHS.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="flex-1" />

        <Button variant="outline" onClick={gerar} disabled={generating}>
          {generating ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Layers className="w-4 h-4 mr-1.5" />}
          Gerar mensalidades
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          onClick={emitirLote}
          disabled={emittingLote || pending === 0}
        >
          {emittingLote ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
          Emitir NFS-e em lote {pending > 0 ? `(${pending})` : ""}
        </Button>
      </div>

      {/* Summary */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-zinc-100 p-4 text-center">
            <p className="text-2xl font-bold text-zinc-900">{invoices.length}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Total</p>
          </div>
          <div className="bg-white rounded-xl border border-zinc-100 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{issued}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Emitidas</p>
          </div>
          <div className="bg-white rounded-xl border border-zinc-100 p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{pending}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Pendentes</p>
          </div>
        </div>
      )}

      {/* Invoice list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white rounded-2xl border border-zinc-100 p-5">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center shrink-0 text-zinc-600 font-bold text-sm">
                  {inv.schoolParent.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-zinc-900">{inv.schoolParent.name}</span>
                    <Badge className={`${STATUS_CLASS[inv.status]} border-0 text-xs`}>
                      {STATUS_LABEL[inv.status]}
                    </Badge>
                    {inv.nfseNumber && (
                      <span className="text-xs text-zinc-400 font-mono">NFS-e #{inv.nfseNumber}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                    {inv.schoolParent.childName && (
                      <span>Criança: <strong className="text-zinc-700">{inv.schoolParent.childName}</strong></span>
                    )}
                    {inv.schoolParent.schoolName && <span>{inv.schoolParent.schoolName}</span>}
                    {inv.nfseIssuedAt && (
                      <span>Emitida em {new Date(inv.nfseIssuedAt).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                  {inv.nfseError && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {inv.nfseError}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-bold text-zinc-900">{formatCurrency(inv.amount)}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {inv.nfseLink && (
                    <a
                      href={inv.nfseLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700"
                      title="Ver NFS-e"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {inv.status !== "ISSUED" && (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 h-8 text-xs px-3"
                      onClick={() => emitirUma(inv)}
                      disabled={emittingId === inv.id}
                    >
                      {emittingId === inv.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 mr-1" />
                          {inv.status === "ERROR" ? "Tentar novamente" : "Emitir NFS-e"}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {invoices.length === 0 && (
            <div className="text-center py-16 text-zinc-400">
              <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>Nenhuma mensalidade em {MONTHS[month]}/{year}</p>
              <p className="text-sm mt-1">Clique em "Gerar mensalidades" para criar</p>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}
    </>
  );
}

// ─── Tab: Configurações NFS-e ─────────────────────────────────────────────────

const EMPTY_CONFIG: NfseConfig = {
  cnpj: "", im: "", razaoSocial: "", itemServico: "14.01", codTributacao: "",
  aliquotaIss: 0.02, ambiente: "homologacao",
  wsUrl: "https://ws-sjrp.giss.com.br/service-ws/nf/nfse-ws",
  wsHomologUrl: "https://ws-ficticio.giss.com.br/service-ws/nf/nfse-ws",
};

function ConfigTab() {
  const [form, setForm] = useState<NfseConfig>(EMPTY_CONFIG);
  const [cert, setCert] = useState<{ found: boolean; path: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get("/api/escola/config").then(({ data }) => {
      if (data.config) {
        setForm({
          cnpj: data.config.cnpj ?? "",
          im: data.config.im ?? "",
          razaoSocial: data.config.razaoSocial ?? "",
          itemServico: data.config.itemServico ?? "14.01",
          codTributacao: data.config.codTributacao ?? "",
          aliquotaIss: data.config.aliquotaIss ?? 0.02,
          ambiente: data.config.ambiente ?? "homologacao",
          wsUrl: data.config.wsUrl ?? EMPTY_CONFIG.wsUrl,
          wsHomologUrl: data.config.wsHomologUrl ?? EMPTY_CONFIG.wsHomologUrl,
        });
      }
      setCert(data.cert);
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      await axios.put("/api/escola/config", form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof NfseConfig, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Certificate status */}
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${cert?.found ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
        {cert?.found ? (
          <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
        ) : (
          <ShieldOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div>
          <p className={`text-sm font-medium ${cert?.found ? "text-green-800" : "text-amber-800"}`}>
            {cert?.found ? "Certificado A1 encontrado" : "Certificado A1 não encontrado"}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">
            {cert?.path ? cert.path : "Configure NFSE_CERT_PATH no arquivo .env"}
          </p>
          {!cert?.found && (
            <p className="text-xs text-amber-700 mt-1">
              Coloque o arquivo <code>.pfx</code> no caminho configurado em <code>NFSE_CERT_PATH</code> e <code>NFSE_CERT_PASSWORD</code> no <code>.env</code>. O certificado não é editável pela interface por segurança.
            </p>
          )}
        </div>
      </div>

      {/* Fiscal data */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
        <h3 className="font-semibold text-zinc-900">Dados do Prestador</h3>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-zinc-500">CNPJ</label>
            <Input
              value={form.cnpj}
              onChange={(e) => set("cnpj", e.target.value)}
              className="mt-1 font-mono"
              placeholder="00.000.000/0001-00"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">Inscrição Municipal</label>
            <Input
              value={form.im}
              onChange={(e) => set("im", e.target.value)}
              className="mt-1 font-mono"
              placeholder="000000-0"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-zinc-500">Razão Social</label>
            <Input
              value={form.razaoSocial}
              onChange={(e) => set("razaoSocial", e.target.value)}
              className="mt-1"
              placeholder="Banguelas Papinhas Ltda"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
        <h3 className="font-semibold text-zinc-900">Configuração Fiscal</h3>
        <p className="text-xs text-zinc-400">Confirme os códigos com sua contabilidade antes de emitir em produção.</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-zinc-500">Código de serviço LC 116</label>
            <Input
              value={form.itemServico}
              onChange={(e) => set("itemServico", e.target.value)}
              className="mt-1 font-mono"
              placeholder="14.01"
            />
            <p className="text-xs text-zinc-400 mt-1">Ex: 14.01 · 17.06 · 17.11</p>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">Código de tributação municipal</label>
            <Input
              value={form.codTributacao}
              onChange={(e) => set("codTributacao", e.target.value)}
              className="mt-1 font-mono"
              placeholder="1401000"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">Alíquota ISS (%)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="5"
              value={(form.aliquotaIss * 100).toFixed(2)}
              onChange={(e) => set("aliquotaIss", parseFloat(e.target.value) / 100)}
              className="mt-1"
              placeholder="2.00"
            />
            <p className="text-xs text-zinc-400 mt-1">Simples Nacional: valor informativo</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
        <h3 className="font-semibold text-zinc-900">Webservice GissOnline</h3>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="text-xs font-medium text-zinc-500">Ambiente</label>
            <div className="flex gap-3 mt-1">
              {["homologacao", "producao"].map((env) => (
                <label key={env} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ambiente"
                    value={env}
                    checked={form.ambiente === env}
                    onChange={() => set("ambiente", env)}
                    className="text-orange-500"
                  />
                  <span className={`text-sm font-medium ${env === "producao" ? "text-red-600" : "text-zinc-700"}`}>
                    {env === "homologacao" ? "Homologação (teste)" : "Produção ⚠️"}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">URL de produção</label>
            <Input
              value={form.wsUrl}
              onChange={(e) => set("wsUrl", e.target.value)}
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">URL de homologação</label>
            <Input
              value={form.wsHomologUrl}
              onChange={(e) => set("wsHomologUrl", e.target.value)}
              className="mt-1 font-mono text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          className="bg-orange-500 hover:bg-orange-600"
          onClick={save}
          disabled={saving}
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          Salvar configurações
        </Button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Salvo com sucesso
          </span>
        )}
      </div>
    </div>
  );
}
