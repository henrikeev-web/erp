"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import EntryForm from "./EntryForm";
import type { FormKind } from "./EntryForm";
import EntriesTab from "./EntriesTab";
import RecurringTab from "./RecurringTab";
import SummaryTab from "./SummaryTab";
import { CostCentersTab, SuppliersTab } from "./CadastrosTab";
import type { CostCenter, Supplier } from "./shared";

type Tab = "summary" | "payable" | "receivable" | "recurring" | "suppliers" | "centers";

const TABS: { value: Tab; label: string }[] = [
  { value: "summary", label: "Resumo" },
  { value: "payable", label: "A pagar" },
  { value: "receivable", label: "A receber" },
  { value: "recurring", label: "Recorrentes" },
  { value: "suppliers", label: "Fornecedores" },
  { value: "centers", label: "Centros de custo" },
];

export default function FinanceiroClient() {
  const [tab, setTab] = useState<Tab>("summary");
  const [version, setVersion] = useState(0); // incrementa a cada alteração: as abas recarregam
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [form, setForm] = useState<FormKind | null>(null);

  // Fornecedores e centros de custo alimentam os selects de todas as abas; recarregam a cada alteração
  useEffect(() => {
    let alive = true;
    Promise.all([
      axios.get("/api/financeiro/fornecedores", { params: { todos: true } }),
      axios.get("/api/financeiro/centros-custo", { params: { todos: true } }),
    ]).then(([s, c]) => {
      if (!alive) return;
      setSuppliers(s.data);
      setCenters(c.data);
    });
    return () => { alive = false; };
  }, [version]);

  const changed = useCallback(() => setVersion((v) => v + 1), []);

  const newType = tab === "receivable" ? "RECEIVABLE" : "PAYABLE";
  const showNew = tab === "summary" || tab === "payable" || tab === "receivable" || tab === "recurring";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Financeiro</h1>
          <p className="text-zinc-500 text-sm">Contas a pagar e a receber, recorrências, fornecedores e centros de custo</p>
        </div>
        {showNew && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setForm({ kind: "create", type: "RECEIVABLE" })}>+ Conta a receber</Button>
            <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setForm({ kind: "create", type: tab === "receivable" ? "RECEIVABLE" : "PAYABLE" })}>+ Conta a pagar</Button>
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto bg-zinc-100 p-1 rounded-xl w-fit max-w-full">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === t.value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && <SummaryTab version={version} />}
      {(tab === "payable" || tab === "receivable") && (
        <EntriesTab key={newType} type={newType} suppliers={suppliers} costCenters={centers} version={version} onEdit={(entry) => setForm({ kind: "entry", entry })} onChanged={changed} />
      )}
      {tab === "recurring" && <RecurringTab version={version} onEdit={(recurring) => setForm({ kind: "recurring", recurring })} onChanged={changed} />}
      {tab === "suppliers" && <SuppliersTab suppliers={suppliers} onChanged={changed} />}
      {tab === "centers" && <CostCentersTab centers={centers} onChanged={changed} />}

      {form && (
        <EntryForm
          target={form}
          suppliers={suppliers}
          costCenters={centers}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); changed(); }}
        />
      )}
    </div>
  );
}
