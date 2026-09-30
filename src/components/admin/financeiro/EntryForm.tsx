"use client";

import { useState } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomerPicker, Field, Modal, errMsg, selectCls, todayStr } from "./shared";
import type { CostCenter, Entry, EntryType, Period, Recurring, Ref, Supplier } from "./shared";

type Mode = "NONE" | "INSTALLMENTS" | "WEEK" | "MONTH" | "YEAR" | "CUSTOM";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "NONE", label: "Não repete" },
  { value: "INSTALLMENTS", label: "Parcelado" },
  { value: "WEEK", label: "Semanal" },
  { value: "MONTH", label: "Mensal" },
  { value: "YEAR", label: "Anual" },
  { value: "CUSTOM", label: "Personalizada…" },
];

function modeFrom(every: number, period: Period): Mode {
  if (every === 1 && period === "WEEK") return "WEEK";
  if (every === 1 && period === "MONTH") return "MONTH";
  if (every === 1 && period === "YEAR") return "YEAR";
  return "CUSTOM";
}

function scheduleFrom(mode: Mode, customEvery: string, customPeriod: Period): { every: number; period: Period } {
  if (mode === "WEEK") return { every: 1, period: "WEEK" };
  if (mode === "MONTH") return { every: 1, period: "MONTH" };
  if (mode === "YEAR") return { every: 1, period: "YEAR" };
  return { every: parseInt(customEvery) || 0, period: customPeriod };
}

export type FormKind =
  | { kind: "create"; type: EntryType }
  | { kind: "entry"; entry: Entry }
  | { kind: "recurring"; recurring: Recurring };

interface Props {
  target: FormKind;
  suppliers: Supplier[];
  costCenters: CostCenter[];
  onSaved: () => void;
  onClose: () => void;
}

export default function EntryForm({ target, suppliers, costCenters, onSaved, onClose }: Props) {
  const src = target.kind === "entry" ? target.entry : target.kind === "recurring" ? target.recurring : null;
  const type: EntryType = target.kind === "create" ? target.type : src!.type;
  const isPayable = type === "PAYABLE";

  const [description, setDescription] = useState(src?.description ?? "");
  const [amount, setAmount] = useState(src ? String(src.amount) : "");
  const [dueDate, setDueDate] = useState(
    target.kind === "entry" ? target.entry.dueDate : target.kind === "recurring" ? target.recurring.startDate : todayStr(),
  );
  const [supplierId, setSupplierId] = useState(src?.supplier?.id ?? "");
  const [customer, setCustomer] = useState<Ref | null>(src?.customer ?? null);
  const [costCenterId, setCostCenterId] = useState(src?.costCenter?.id ?? "");
  const [notes, setNotes] = useState(src?.notes ?? "");

  const rec = target.kind === "recurring" ? target.recurring : null;
  const [mode, setMode] = useState<Mode>(rec ? modeFrom(rec.every, rec.period) : "NONE");
  const [installments, setInstallments] = useState("2");
  const [customEvery, setCustomEvery] = useState(rec ? String(rec.every) : "45");
  const [customPeriod, setCustomPeriod] = useState<Period>(rec?.period ?? "DAY");
  const [endDate, setEndDate] = useState(rec?.endDate ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const repeats = mode === "WEEK" || mode === "MONTH" || mode === "YEAR" || mode === "CUSTOM";
  const title =
    target.kind === "recurring" ? "Editar recorrência"
    : target.kind === "entry" ? "Editar lançamento"
    : isPayable ? "Nova conta a pagar" : "Nova conta a receber";

  async function save() {
    setError("");
    if (description.trim().length < 2) return setError("Informe a descrição");
    const value = parseFloat(amount.replace(",", "."));
    if (!(value > 0)) return setError("Informe um valor maior que zero");
    if (!dueDate) return setError("Informe a data");
    if (mode === "CUSTOM" && !(parseInt(customEvery) >= 1)) return setError("Informe a frequência (mínimo 1)");

    const refs = {
      supplierId: isPayable ? supplierId || null : null,
      customerId: !isPayable ? customer?.id ?? null : null,
      costCenterId: costCenterId || null,
    };

    setSaving(true);
    try {
      if (target.kind === "entry") {
        await axios.patch(`/api/financeiro/lancamentos/${target.entry.id}`, { description, amount: value, dueDate, notes: notes || null, ...refs });
      } else if (target.kind === "recurring") {
        const sch = scheduleFrom(mode, customEvery, customPeriod);
        await axios.patch(`/api/financeiro/recorrentes/${target.recurring.id}`, { description, amount: value, startDate: dueDate, endDate: endDate || null, notes: notes || null, ...sch, ...refs });
      } else {
        await axios.post("/api/financeiro/lancamentos", {
          type, description, amount: value, dueDate, notes: notes || null, ...refs,
          ...(mode === "INSTALLMENTS" ? { installments: parseInt(installments) || 1 } : {}),
          ...(repeats ? { recurrence: { ...scheduleFrom(mode, customEvery, customPeriod), endDate: endDate || null } } : {}),
        });
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Descrição *">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isPayable ? "Ex.: Aluguel do galpão" : "Ex.: Pedido faturado – Mercadinho Sol"} autoFocus />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={mode === "INSTALLMENTS" ? "Valor total (R$) *" : "Valor (R$) *"}>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={target.kind === "recurring" ? "Primeira cobrança *" : mode === "INSTALLMENTS" ? "Vencimento da 1ª parcela *" : "Vencimento *"}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {isPayable ? (
          <Field label="Fornecedor">
            <select className={selectCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— sem fornecedor —</option>
              {suppliers.filter((s) => s.active || s.id === supplierId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Cliente">
            <CustomerPicker value={customer} onChange={setCustomer} />
          </Field>
        )}
        <Field label="Centro de custo">
          <select className={selectCls} value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
            <option value="">— sem centro de custo —</option>
            {costCenters.filter((c) => c.active || c.id === costCenterId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      {target.kind !== "entry" && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-3">
          <Field label="Repetição">
            <select className={selectCls} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              {(target.kind === "recurring" ? MODE_OPTIONS.filter((o) => o.value !== "NONE" && o.value !== "INSTALLMENTS") : MODE_OPTIONS).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {mode === "INSTALLMENTS" && (
            <Field label="Número de parcelas" hint="O valor total é dividido igualmente; a última parcela ajusta os centavos. Vencimentos mensais.">
              <Input type="number" min="2" max="60" value={installments} onChange={(e) => setInstallments(e.target.value)} />
            </Field>
          )}

          {mode === "CUSTOM" && (
            <Field label="Repetir a cada">
              <div className="flex gap-2">
                <Input type="number" min="1" max="365" value={customEvery} onChange={(e) => setCustomEvery(e.target.value)} className="w-24" />
                <select className={selectCls} value={customPeriod} onChange={(e) => setCustomPeriod(e.target.value as Period)}>
                  <option value="DAY">dia(s)</option>
                  <option value="WEEK">semana(s)</option>
                  <option value="MONTH">mês(es)</option>
                  <option value="YEAR">ano(s)</option>
                </select>
              </div>
            </Field>
          )}

          {repeats && (
            <>
              <Field label="Repetir até (opcional)" hint="Deixe em branco para repetir sem data final.">
                <Input type="date" value={endDate} min={dueDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
              <p className="text-[11px] text-zinc-500">
                As cobranças aparecem na lista com até 60 dias de antecedência.
                {target.kind === "recurring" && " Mudar valor ou vínculos atualiza as cobranças futuras em aberto (inclusive as que você editou individualmente); mudar a frequência ou as datas refaz as futuras. As já pagas ou vencidas não mudam."}
              </p>
            </>
          )}
        </div>
      )}

      <Field label="Observações">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" />
      </Field>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </div>
    </Modal>
  );
}
