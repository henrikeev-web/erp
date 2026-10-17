"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { CreditCard, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// InfiniteTag (InfinitePay) da unidade: conta que recebe os pagamentos online (PIX e cartão) do cardápio.
export default function PagamentoOnlineCard() {
  const [allowed, setAllowed] = useState(false);
  const [handle, setHandle] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [usingDefault, setUsingDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    axios.get("/api/unit/pagamento").then(({ data }) => {
      setAllowed(true);
      setHandle(data.handle);
      setEnabled(data.enabled);
      setUsingDefault(data.usingDefault);
    }).catch(() => setAllowed(false)); // STAFF não administra pagamento
  }, []);

  if (!allowed) return null;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const { data } = await axios.put("/api/unit/pagamento", { handle });
      setHandle(data.handle);
      setEnabled(data.enabled);
      setUsingDefault(false);
      setMsg({ ok: true, text: data.enabled ? "Salvo. Pagamento online ativado nesta unidade." : "Salvo. Pagamento online desativado." });
    } catch (e) {
      setMsg({ ok: false, text: axios.isAxiosError(e) ? e.response?.data?.error ?? "Erro ao salvar" : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-orange-500" />
        <h2 className="font-semibold text-zinc-900">Pagamento online (InfinitePay)</h2>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${enabled ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
          {enabled ? "Ativo" : "Desativado"}
        </span>
      </div>
      <p className="text-sm text-zinc-500">
        Informe a <strong>InfiniteTag</strong> da conta InfinitePay que recebe os pagamentos desta unidade (o nome de usuário no app, <strong>sem o $</strong>).
        Com ela preenchida, o cardápio oferece PIX e cartão online. Em branco, só pagamento na entrega.
      </p>
      {usingDefault && <p className="text-xs text-amber-600">Usando a InfiniteTag padrão do servidor. Preencha para usar uma própria.</p>}
      <div className="flex gap-2 max-w-md">
        <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="ex.: banguelas" autoComplete="off" />
        <Button onClick={save} disabled={saving} className="gap-2"><Save className="w-4 h-4" />{saving ? "Salvando…" : "Salvar"}</Button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
