"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { Bike, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Courier { id: string; name: string; phone: string | null }

const errMsg = (e: unknown, f = "Erro ao atualizar pedido") => (axios.isAxiosError(e) && e.response?.data?.error ? String(e.response.data.error) : f);

/** Escolha do entregador. Só ADMIN cadastra entregador novo (envolve chave PIX de pagamento). */
export function CourierPickerModal({ title, current, onPick, onClose }: { title: string; current?: string | null; onPick: (courierId: string) => Promise<void>; onClose: () => void }) {
  const { data: session } = useSession();
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(session?.user?.role ?? "");
  const [couriers, setCouriers] = useState<Courier[] | null>(null);
  const [selected, setSelected] = useState<string>(current ?? "");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    axios.get("/api/entregadores").then(({ data }) => alive && setCouriers(data));
    return () => { alive = false; };
  }, []);

  async function confirm(id: string) {
    setSaving(true); setError("");
    try { await onPick(id); } catch (e) { setError(errMsg(e)); setSaving(false); }
  }

  async function createAndPick() {
    setSaving(true); setError("");
    try {
      const { data } = await axios.post("/api/entregadores", { name, phone: phone || null });
      await onPick(data.id);
    } catch (e) { setError(errMsg(e, "Erro ao cadastrar")); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h3 className="font-semibold text-zinc-900 flex items-center gap-2"><Bike className="w-4 h-4 text-orange-500" /> {title}</h3>
          <button onClick={onClose} disabled={saving} aria-label="Fechar" className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          {couriers === null ? <p className="text-sm text-zinc-400">Carregando…</p> : (
            <>
              {couriers.length === 0 && !adding && <p className="text-sm text-zinc-500">Nenhum entregador cadastrado. {isAdmin ? "Cadastre abaixo." : "Peça a um administrador para cadastrar."}</p>}
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {couriers.map((c) => (
                  <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm ${selected === c.id ? "border-orange-500 bg-orange-50" : "border-zinc-200 hover:border-zinc-300"}`}>
                    <span className="font-medium text-zinc-900">{c.name}</span>{c.phone && <span className="text-zinc-400"> · {c.phone}</span>}
                  </button>
                ))}
              </div>
              {isAdmin && (adding ? (
                <div className="space-y-2 border-t border-zinc-100 pt-3">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do entregador" autoFocus />
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone (opcional)" inputMode="tel" />
                  <Button className="w-full bg-orange-500 hover:bg-orange-600" disabled={saving || name.trim().length < 2} onClick={createAndPick}>Cadastrar e selecionar</Button>
                </div>
              ) : <button onClick={() => setAdding(true)} className="text-sm text-orange-600 hover:underline">+ Cadastrar novo entregador</button>)}
            </>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          {!adding && (
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" disabled={!selected || saving} onClick={() => confirm(selected)}>{saving ? "Salvando…" : "Confirmar"}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Mudança de status de pedido com a regra do entregador: se o servidor avisar que falta o entregador
 * (pedido de entrega indo p/ produção/pronto/enviado/entregue), abre o seletor e refaz a chamada com ele.
 * `pickCourier(orderId)` abre o seletor só para trocar de entregador (sem mudar o status).
 */
export function useOrderStatus(onDone: () => void) {
  const [ask, setAsk] = useState<{ orderId: string; status?: string; current?: string | null } | null>(null);

  const change = useCallback(async (orderId: string, status: string, extra: Record<string, unknown> = {}) => {
    try {
      await axios.patch(`/api/pedidos/${orderId}`, { status, ...extra });
      onDone();
      return true;
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409 && e.response.data?.code === "COURIER_REQUIRED") {
        setAsk({ orderId, status });
        return false;
      }
      alert(errMsg(e));
      return false;
    }
  }, [onDone]);

  const pickCourier = useCallback((orderId: string, current?: string | null) => setAsk({ orderId, current }), []);

  const modal = ask ? (
    <CourierPickerModal
      title={ask.status ? "Quem fará esta entrega?" : "Trocar entregador"}
      current={ask.current}
      onClose={() => setAsk(null)}
      onPick={async (courierId) => {
        await axios.patch(`/api/pedidos/${ask.orderId}`, { ...(ask.status ? { status: ask.status } : {}), courierId });
        setAsk(null);
        onDone();
      }}
    />
  ) : null;

  return { change, pickCourier, modal };
}
