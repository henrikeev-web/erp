"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { MessageCircle, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Mensagem automática de WhatsApp ao entrar um pedido (loja + Goomer). Só administrador da matriz (a API devolve 403 aos demais).
interface Recent { number: string; customer: string; origin: string; value: number; at: string; status: string }
interface Data {
  enabled: boolean; threshold: number; messageBelow: string; messageAbove: string;
  evolutionConfigured: boolean; recent: Recent[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const errMsg = (e: unknown, fallback: string) => (axios.isAxiosError(e) ? e.response?.data?.error ?? fallback : fallback);

export default function MensagemAutomaticaCard() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ enabled: false, threshold: "120", messageBelow: "", messageAbove: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState<"below" | "above" | null>(null);

  function apply(d: Data) {
    setData(d);
    setForm({ enabled: d.enabled, threshold: String(d.threshold).replace(".", ","), messageBelow: d.messageBelow, messageAbove: d.messageAbove });
  }

  useEffect(() => {
    axios.get("/api/mensagens-automaticas").then(({ data }) => apply(data)).catch(() => setData(null));
  }, []);

  if (!data) return null;

  const threshold = Number(form.threshold.replace(/\./g, "").replace(",", "."));

  async function save(enabled = form.enabled) {
    setSaving(true);
    setMsg(null);
    try {
      const { data: d } = await axios.put("/api/mensagens-automaticas", { ...form, enabled, threshold });
      apply(d);
      setMsg({ ok: true, text: d.enabled ? "Salvo. Mensagem automática LIGADA." : "Salvo. Mensagem automática desligada." });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "Erro ao salvar") });
    } finally {
      setSaving(false);
    }
  }

  async function test(kind: "below" | "above") {
    setTesting(kind);
    setMsg(null);
    try {
      await axios.post("/api/mensagens-automaticas/teste", { phone: testPhone, text: kind === "below" ? form.messageBelow : form.messageAbove });
      setMsg({ ok: true, text: "Mensagem de teste enviada." });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "Erro ao enviar o teste") });
    } finally {
      setTesting(null);
    }
  }

  const label = Number.isFinite(threshold) ? brl(threshold) : "o valor";

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-orange-500" />
        <h2 className="font-semibold text-zinc-900">Mensagem automática no WhatsApp</h2>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${data.enabled ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
          {data.enabled ? "Ligada" : "Desligada"}
        </span>
      </div>
      <p className="text-sm text-zinc-500">
        Assim que um pedido entra (cardápio da loja ou Goomer), o cliente recebe uma mensagem do WhatsApp da Banguelas.
        Vale o valor dos produtos, <strong>sem a taxa de entrega</strong>. Use <code className="bg-zinc-100 px-1 rounded">[nome]</code> para o primeiro nome do cliente.
        Revendedores, franqueados e pedidos cancelados não recebem.
      </p>
      {!data.evolutionConfigured && (
        <p className="text-xs text-amber-600">A conexão com o WhatsApp (Evolution API) ainda não está configurada no servidor: nada será enviado.</p>
      )}

      <div className="flex items-center gap-2 max-w-xs">
        <label className="text-sm text-zinc-700 whitespace-nowrap">Valor de corte (R$)</label>
        <Input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} inputMode="decimal" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Pedido abaixo de {label}</label>
          <textarea
            className="w-full min-h-64 rounded-xl border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            value={form.messageBelow}
            onChange={(e) => setForm({ ...form, messageBelow: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Pedido de {label} ou mais</label>
          <textarea
            className="w-full min-h-64 rounded-xl border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            value={form.messageAbove}
            onChange={(e) => setForm({ ...form, messageAbove: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save()} disabled={saving} variant="outline" className="gap-2"><Save className="w-4 h-4" />Salvar textos</Button>
        {data.enabled
          ? <Button onClick={() => save(false)} disabled={saving} variant="outline" className="gap-2 text-red-600">Desligar</Button>
          : <Button onClick={() => save(true)} disabled={saving} className="gap-2">Salvar e ligar</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
        <span className="text-sm text-zinc-700">Testar no número</span>
        <Input className="max-w-44" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="17 99999-9999" inputMode="tel" />
        <Button variant="outline" size="sm" onClick={() => test("below")} disabled={!!testing || !testPhone} className="gap-1"><Send className="w-3 h-3" />Abaixo</Button>
        <Button variant="outline" size="sm" onClick={() => test("above")} disabled={!!testing || !testPhone} className="gap-1"><Send className="w-3 h-3" />Acima</Button>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}

      {data.recent.length > 0 && (
        <div className="border-t border-zinc-100 pt-4">
          <p className="text-sm font-medium text-zinc-700 mb-2">Últimos envios</p>
          <div className="space-y-1 text-xs text-zinc-600">
            {data.recent.map((r) => (
              <div key={r.number + r.at} className="flex flex-wrap gap-x-3">
                <span className="font-mono">#{r.number}</span>
                <span>{r.origin}</span>
                <span className="truncate max-w-40">{r.customer}</span>
                <span>{brl(r.value)}</span>
                <span>{new Date(r.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                <span className={r.status === "SENT" ? "text-green-600" : r.status.startsWith("FAILED") ? "text-red-600" : "text-zinc-400"}>
                  {r.status === "SENT" ? "enviada" : r.status.startsWith("FAILED") ? `falhou (${r.status.slice(8, 80)})` : r.status.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
