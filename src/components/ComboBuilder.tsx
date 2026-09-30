"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { validatePicks } from "@/lib/combo";
import type { ComboOption, ComboPick } from "@/lib/combo";
import type { PublicComboOption } from "@/lib/combo-data";

/**
 * Construtor do combo: o cliente/operador distribui a quantidade EXATA entre os produtos do combo.
 * Regras (as mesmas do servidor, via validatePicks): limite por produto definido pelo operador, produto sem
 * estoque apagado e marcado "sem estoque". O servidor valida tudo de novo ao fechar o pedido.
 */
interface Props {
  name: string;
  size: number;
  price: number;
  options: PublicComboOption[];
  onConfirm: (picks: ComboPick[]) => void;
  onClose: () => void;
  confirmLabel?: string;
}

export default function ComboBuilder({ name, size, price, options, onConfirm, onClose, confirmLabel = "Adicionar ao carrinho" }: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const total = useMemo(() => Object.values(qty).reduce((s, n) => s + n, 0), [qty]);
  const remaining = size - total;

  // Mesma validação do servidor (mensagens incluídas)
  const rules: ComboOption[] = options.map((o) => ({ productId: o.productId, name: o.name, maxQty: o.maxQty, active: !o.soldOut || (o.stock !== null && o.stock > 0), stock: o.soldOut ? 0 : o.stock }));
  const picks: ComboPick[] = Object.entries(qty).filter(([, n]) => n > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const result = validatePicks(rules, size, picks);
  const valid = "picks" in result;

  const setN = (o: PublicComboOption, next: number) => {
    // Teto de cada produto: limite do operador, estoque e o que ainda falta para fechar o combo
    const cap = Math.min(o.maxQty ?? size, o.stock ?? Infinity, size);
    const current = qty[o.productId] ?? 0;
    const bounded = Math.max(0, Math.min(next, cap, current + remaining));
    setQty((s) => ({ ...s, [o.productId]: bounded }));
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(74,53,38,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#FBF6EC", width: "100%", maxWidth: 560, maxHeight: "94vh", borderRadius: "22px 22px 0 0", display: "flex", flexDirection: "column", fontFamily: "'Poppins',sans-serif", color: "#4A3526" }}>
        <div style={{ padding: "16px 18px 12px", borderBottom: "2px solid #F0E7D6", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 20, lineHeight: 1.15 }}>{name}</div>
            <div style={{ fontSize: 13, color: "#9A8A78" }}>Escolha {size} itens · valor fixo</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "#F2E8D6", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer" }}><X size={16} /></button>
        </div>

        {/* Contador */}
        <div style={{ padding: "10px 18px", background: valid ? "#E8F5E9" : "#fff", borderBottom: "1px solid #F0E7D6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
            <span>{total} de {size}</span>
            <span style={{ color: valid ? "#2E7D32" : "#F26C21" }}>{valid ? "Pronto!" : remaining > 0 ? `faltam ${remaining}` : `sobram ${-remaining}`}</span>
          </div>
          <div style={{ height: 6, background: "#EBDDC8", borderRadius: 999, marginTop: 6 }}>
            <div style={{ height: 6, width: `${Math.min(100, (total / size) * 100)}%`, background: valid ? "#43A047" : "#F26C21", borderRadius: 999, transition: "width .15s" }} />
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "8px 14px", flex: 1 }}>
          {options.map((o) => {
            const n = qty[o.productId] ?? 0;
            const cap = Math.min(o.maxQty ?? size, o.stock ?? Infinity, size);
            const atLimit = !o.soldOut && n >= cap && n > 0;
            return (
              <div key={o.productId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: "1px solid #F0E7D6", opacity: o.soldOut ? 0.45 : 1 }}>
                {o.imageUrl ? <img src={o.imageUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flex: "none", filter: o.soldOut ? "grayscale(1)" : undefined }} /> : <div style={{ width: 44, height: 44, borderRadius: 10, background: "#F2E8D6", flex: "none" }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{o.name}</div>
                  <div style={{ fontSize: 11.5, color: "#9A8A78" }}>
                    {o.soldOut ? <strong style={{ color: "#C62828" }}>sem estoque</strong> : o.maxQty !== null ? `máx. ${o.maxQty} por combo${atLimit ? " · limite atingido" : ""}` : " "}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <button onClick={() => setN(o, n - 1)} disabled={o.soldOut || n === 0} aria-label={`Menos ${o.name}`} style={btn(o.soldOut || n === 0)}><Minus size={15} /></button>
                  <span style={{ width: 26, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{n}</span>
                  <button onClick={() => setN(o, n + 1)} disabled={o.soldOut || n >= cap || remaining <= 0} aria-label={`Mais ${o.name}`} style={btn(o.soldOut || n >= cap || remaining <= 0)}><Plus size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 18px 16px", borderTop: "2px solid #F0E7D6" }}>
          {!valid && total > 0 && <div style={{ fontSize: 12, color: "#C62828", marginBottom: 6 }}>{"error" in result ? result.error : ""}</div>}
          <button
            disabled={!valid}
            onClick={() => valid && onConfirm(result.picks)}
            style={{ width: "100%", background: valid ? "#F26C21" : "#D9CDB8", color: "#fff", border: "none", borderRadius: 16, padding: "14px 18px", fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 17, cursor: valid ? "pointer" : "not-allowed" }}
          >
            {confirmLabel} · {price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </button>
        </div>
      </div>
    </div>
  );
}

const btn = (disabled: boolean): React.CSSProperties => ({
  width: 32, height: 32, borderRadius: 10, border: "none", background: disabled ? "#EFE6D6" : "#F26C21", color: disabled ? "#B8AA95" : "#fff",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer",
});
