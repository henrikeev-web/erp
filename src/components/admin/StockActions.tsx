"use client";

import { useState } from "react";
import { Plus, Minus, Loader2 } from "lucide-react";
import axios from "axios";
import { useRouter } from "next/navigation";

interface StockActionsProps {
  stockItemId: string;
  productName: string;
}

export default function StockActions({ stockItemId, productName }: StockActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function adjust(type: "IN" | "OUT" | "ADJUSTMENT") {
    const qtyStr = window.prompt(
      type === "IN"
        ? `Adicionar unidades de "${productName}":`
        : type === "OUT"
        ? `Remover unidades de "${productName}":`
        : `Nova quantidade total de "${productName}":`
    );
    if (qtyStr === null) return;
    const qty = parseInt(qtyStr);
    if (isNaN(qty) || qty < 0) { alert("Quantidade inválida"); return; }

    setLoading(true);
    try {
      await axios.post(`/api/estoque/${stockItemId}/movimentar`, { type, quantity: qty });
      router.refresh();
    } catch {
      alert("Erro ao atualizar estoque");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />;

  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => adjust("IN")}
        className="w-8 h-8 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 flex items-center justify-center transition-colors"
        title="Adicionar estoque"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        onClick={() => adjust("OUT")}
        className="w-8 h-8 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 flex items-center justify-center transition-colors"
        title="Remover estoque"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button
        onClick={() => adjust("ADJUSTMENT")}
        className="px-2.5 h-8 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 text-xs font-medium transition-colors"
        title="Ajuste total"
      >
        Ajustar
      </button>
    </div>
  );
}
