"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Tipos (espelham a API /api/financeiro/*) ────────────────────────────────

export type EntryType = "PAYABLE" | "RECEIVABLE";
export type Period = "DAY" | "WEEK" | "MONTH" | "YEAR";

export interface Ref { id: string; name: string }

export interface Entry {
  id: string; type: EntryType; description: string; amount: number;
  dueDate: string; status: "OPEN" | "PAID" | "CANCELLED"; overdue: boolean;
  paidAt: string | null; paidAmount: number | null; payMethod: string | null; notes: string | null;
  source: "MANUAL" | "RECURRING" | "ORDER" | "COURIER";
  installmentNumber: number | null; installmentTotal: number | null;
  supplier: Ref | null; customer: Ref | null; costCenter: Ref | null;
}

export interface Recurring {
  id: string; type: EntryType; description: string; amount: number;
  every: number; period: Period; startDate: string; endDate: string | null; active: boolean; notes: string | null;
  supplier: Ref | null; customer: Ref | null; costCenter: Ref | null;
}

export interface Supplier { id: string; name: string; document: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean }
export interface CostCenter { id: string; name: string; active: boolean }

// ── Formatação ──────────────────────────────────────────────────────────────

export const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** "2026-10-05" → "05/10/2026" (sem passar por Date: evita deslocar o dia por fuso) */
export const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayStr = () => ymd(new Date());

export function formatDoc(d: string | null) {
  if (!d) return "—";
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

const UNIT_LABEL: Record<Period, [string, string]> = { DAY: ["dia", "dias"], WEEK: ["semana", "semanas"], MONTH: ["mês", "meses"], YEAR: ["ano", "anos"] };

/** Rótulo legível da frequência: "Mensal", "Quinzenal"… ou "A cada 45 dias" */
export function frequencyLabel(every: number, period: Period): string {
  if (every === 1) return { DAY: "Diária", WEEK: "Semanal", MONTH: "Mensal", YEAR: "Anual" }[period];
  if (every === 2 && period === "WEEK") return "Quinzenal";
  if (every === 2 && period === "MONTH") return "Bimestral";
  if (every === 3 && period === "MONTH") return "Trimestral";
  if (every === 6 && period === "MONTH") return "Semestral";
  return `A cada ${every} ${UNIT_LABEL[period][1]}`;
}

export const errMsg = (e: unknown, fallback = "Erro ao salvar") =>
  axios.isAxiosError(e) && e.response?.data?.error ? String(e.response.data.error) : fallback;

// ── Componentes de apoio ────────────────────────────────────────────────────

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center" aria-label="Fechar">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-zinc-600 mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}

export const selectCls = "w-full h-10 text-sm border border-zinc-200 rounded-xl px-3 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export function StatusBadge({ e }: { e: Pick<Entry, "status" | "overdue"> }) {
  const [label, cls] =
    e.status === "PAID" ? ["Pago", "bg-emerald-50 text-emerald-700"]
    : e.status === "CANCELLED" ? ["Cancelado", "bg-zinc-100 text-zinc-500"]
    : e.overdue ? ["Vencido", "bg-red-50 text-red-700"]
    : ["Em aberto", "bg-amber-50 text-amber-700"];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>;
}

/** Busca de cliente (para contas a receber): digita ≥ 2 letras e escolhe. */
export function CustomerPicker({ value, onChange }: { value: Ref | null; onChange: (c: Ref | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Ref[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      axios.get("/api/clientes", { params: { q: q.trim(), limit: 8 } }).then(({ data }) => setResults(data.customers));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between h-10 px-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm">
        <span className="truncate">{value.name}</span>
        <button type="button" onClick={() => { onChange(null); setQ(""); setResults([]); }} className="text-xs text-orange-600 hover:underline">trocar</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente por nome ou telefone…" />
      {q.trim().length >= 2 && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id} type="button" onClick={() => { onChange({ id: c.id, name: c.name }); setResults([]); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-orange-50">
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
