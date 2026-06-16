"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { orderStatusLabel } from "@/lib/utils";
import { Loader2, Printer } from "lucide-react";

const TRANSITIONS: Record<string, { next: string; label: string; color: string }> = {
  PENDING: { next: "CONFIRMED", label: "Confirmar pedido", color: "bg-blue-500 hover:bg-blue-600" },
  CONFIRMED: { next: "IN_PRODUCTION", label: "Iniciar produção", color: "bg-purple-500 hover:bg-purple-600" },
  IN_PRODUCTION: { next: "READY", label: "Marcar como pronto", color: "bg-green-500 hover:bg-green-600" },
  READY: { next: "DISPATCHED", label: "Enviar para entrega", color: "bg-cyan-500 hover:bg-cyan-600" },
  DISPATCHED: { next: "DELIVERED", label: "Confirmar entrega", color: "bg-zinc-700 hover:bg-zinc-900" },
};

interface OrderActionsProps {
  order: { id: string; status: string; number: number };
}

export default function OrderActions({ order }: OrderActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  const transition = TRANSITIONS[order.status];

  async function handleStatusChange() {
    if (!transition) return;
    setLoading(true);
    try {
      await axios.patch(`/api/pedidos/${order.id}`, { status: transition.next });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    const reason = window.prompt("Motivo do cancelamento (opcional):");
    if (reason === null) return;
    setLoading(true);
    try {
      await axios.patch(`/api/pedidos/${order.id}`, { status: "CANCELLED", cancelReason: reason });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handlePrintRomaneio() {
    setPrintLoading(true);
    try {
      const res = await fetch(`/api/pedidos/${order.id}/romaneio`);
      if (!res.ok) throw new Error("Erro ao gerar romaneio");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      alert("Erro ao gerar romaneio");
    } finally {
      setPrintLoading(false);
    }
  }

  if (["DELIVERED", "CANCELLED"].includes(order.status)) {
    return (
      <div className="flex gap-2">
        <Button onClick={handlePrintRomaneio} disabled={printLoading} variant="outline" className="flex items-center gap-2">
          {printLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          Romaneio
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {transition && (
        <Button
          onClick={handleStatusChange}
          disabled={loading}
          className={`text-white ${transition.color}`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {transition.label}
        </Button>
      )}

      <Button onClick={handlePrintRomaneio} disabled={printLoading} variant="outline" className="flex items-center gap-2">
        {printLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        Romaneio
      </Button>

      {order.status !== "CANCELLED" && (
        <Button onClick={handleCancel} disabled={loading} variant="outline" className="text-red-500 border-red-200 hover:bg-red-50">
          Cancelar pedido
        </Button>
      )}
    </div>
  );
}
