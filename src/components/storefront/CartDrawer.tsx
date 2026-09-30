"use client";

import { useCart } from "@/store/cart";
import { formatCurrency } from "@/lib/utils";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
  freeFrom: number;
  deliveryFee: number;
  showFreeHint: boolean;
}

function MascoteEmpty() {
  return (
    <svg viewBox="0 0 120 120" width="92" height="92" style={{ overflow: "visible", opacity: .9, animation: "bgl-wig 2.5s ease-in-out infinite" }}>
      <path d="M64 24 C66 7 98 5 102 26 C105 42 87 47 82 34" fill="none" stroke="#231a14" strokeWidth="11" strokeLinecap="round" />
      <circle cx="58" cy="66" r="46" fill="#fff" stroke="#EBDDC8" strokeWidth="2" />
      <ellipse cx="46" cy="55" rx="6" ry="9" fill="#231a14" />
      <ellipse cx="72" cy="55" rx="6" ry="9" fill="#231a14" />
      <path d="M40 80 Q58 70 76 80" fill="none" stroke="#231a14" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

export default function CartDrawer({ open, onClose, onCheckout, freeFrom, deliveryFee, showFreeHint }: CartDrawerProps) {
  const { items, remove, removeLine, updateQty, subtotal } = useCart();

  const sub = subtotal();
  const total = sub + (sub > 0 ? deliveryFee : 0);
  const freeRemain = freeFrom - sub;
  const deliveryLabel = sub === 0 ? "—" : deliveryFee === 0 ? "Grátis" : formatCurrency(deliveryFee);
  const deliveryColor = deliveryFee === 0 && sub > 0 ? "#5E8A2B" : "#6B5640";

  const PALETTE: Record<number, { tint: string; color: string }> = {
    0: { color: "#F26C21", tint: "#FCE6D4" },
    1: { color: "#62C1B1", tint: "#DBF1ED" },
    2: { color: "#E55C5A", tint: "#FBE3E2" },
    3: { color: "#9BCB3B", tint: "#E8F3D2" },
    4: { color: "#FAD200", tint: "#FEF3C9" },
    5: { color: "#C7B89D", tint: "#EFE9DC" },
  };

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(40,28,18,.5)", animation: "bgl-fade .2s ease" }}
        />
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", top: 0, right: 0, height: "100%", width: "min(430px,100vw)",
          background: "#FBF6EC", boxShadow: "-22px 0 54px rgba(0,0,0,.22)",
          display: "flex", flexDirection: "column", zIndex: 56,
          transition: "transform .3s cubic-bezier(.2,.8,.3,1)",
          transform: open ? "translateX(0)" : "translateX(105%)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "2px solid #F0E7D6" }}>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 21, color: "#4A3526" }}>Seu carrinho</div>
          <button
            onClick={onClose}
            style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: "#F2E8D6", color: "#4A3526", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Empty */}
        {items.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30, gap: 14 }}>
            <MascoteEmpty />
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 20, color: "#4A3526" }}>Tá vazio por aqui!</div>
            <p style={{ color: "#8A7A68", margin: 0, maxWidth: 240, fontFamily: "'Poppins',sans-serif", fontSize: 14 }}>
              Bora encher esse carrinho de comida de verdade pro seu pequeno?
            </p>
            <button
              onClick={onClose}
              style={{ background: "#F26C21", color: "#fff", border: "none", borderRadius: 14, padding: "13px 22px", fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 0 #C9530C" }}
            >
              Ver o cardápio
            </button>
          </div>
        )}

        {/* Items */}
        {items.length > 0 && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
              {items.map(({ product, quantity, lineId, combo, comboSummary }, idx) => {
                const c = PALETTE[idx % 6];
                return (
                  <div key={lineId ?? product.id} style={{ display: "flex", gap: 13, padding: "15px 0", borderBottom: "1px solid #EEE3D0" }}>
                    <div style={{ width: 62, height: 62, borderRadius: 15, flex: "none", background: c.tint, position: "relative", overflow: "hidden" }}>
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ position: "absolute", width: 50, height: 50, borderRadius: "46% 54% 60% 40%/45% 55% 45% 55%", background: c.color, opacity: .3, right: -12, bottom: -12 }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 600, fontSize: 14.5, lineHeight: 1.15, color: "#4A3526" }}>{product.name}</div>
                      <div style={{ fontSize: 12.5, color: "#9A8A78", marginTop: 2 }}>{formatCurrency(product.price)} {combo ? "· valor fixo" : "cada"}</div>
                      {combo && <div style={{ fontSize: 11.5, color: "#9A8A78", marginTop: 4, lineHeight: 1.35 }}>{comboSummary}</div>}
                      {!combo && <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginTop: 8, gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "2px solid #EBDDC8", borderRadius: 11, padding: 3, width: "max-content" }}>
                          <button onClick={() => updateQty(product.id, quantity - 1)} style={{ width: 28, height: 28, border: "none", background: "#F7EEDF", color: "#4A3526", borderRadius: 8, fontSize: 17, fontWeight: 700, cursor: "pointer", lineHeight: 0 }}>−</button>
                          <span style={{ minWidth: 26, textAlign: "center", fontWeight: 700, fontSize: 14, color: "#4A3526", fontFamily: "'Baloo 2',sans-serif" }}>{quantity}</span>
                          <button
                            onClick={() => { const r = updateQty(product.id, quantity + 1); if (r === "stock_limit") { /* already capped */ } }}
                            disabled={product.stock !== undefined && quantity >= product.stock}
                            style={{ width: 28, height: 28, border: "none", background: product.stock !== undefined && quantity >= product.stock ? "#F0EBE2" : "#F7EEDF", color: product.stock !== undefined && quantity >= product.stock ? "#C7B89D" : "#4A3526", borderRadius: 8, fontSize: 17, fontWeight: 700, cursor: product.stock !== undefined && quantity >= product.stock ? "not-allowed" : "pointer", lineHeight: 0 }}>+</button>
                        </div>
                        {product.stock !== undefined && quantity >= product.stock && (
                          <span style={{ fontSize: 10, color: "#E55C5A", fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>Limite de estoque</span>
                        )}
                      </div>}
                    </div>
                    <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between" }}>
                      <button
                        onClick={() => (lineId ? removeLine(lineId) : remove(product.id))}
                        style={{ border: "none", background: "none", color: "#C7B89D", cursor: "pointer", padding: 2 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#E55C5A")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#C7B89D")}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 16, color: "#4A3526" }}>{formatCurrency(product.price * quantity)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 20px 20px", borderTop: "2px solid #F0E7D6", background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6B5640", marginBottom: 6 }}>
                <span>Subtotal</span><span style={{ fontWeight: 600 }}>{formatCurrency(sub)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6B5640", marginBottom: 10 }}>
                <span>Entrega</span>
                <span style={{ fontWeight: 700, color: deliveryColor }}>{deliveryLabel}</span>
              </div>
              {showFreeHint && (
                <div style={{ background: "#EAF6E0", color: "#5E8A2B", fontSize: 12.5, fontWeight: 600, padding: "8px 12px", borderRadius: 11, marginBottom: 12, textAlign: "center" }}>
                  Faltam {formatCurrency(freeRemain > 0 ? freeRemain : 0)} pra ganhar frete grátis! 🚚
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <span style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 18, color: "#4A3526" }}>Total</span>
                <span style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 24, color: "#4A3526" }}>{formatCurrency(total)}</span>
              </div>
              <button
                onClick={onCheckout}
                style={{ width: "100%", background: "#F26C21", color: "#fff", border: "none", borderRadius: 16, padding: 16, fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 17, cursor: "pointer", boxShadow: "0 5px 0 #C9530C", transition: "transform .12s,box-shadow .12s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FF7A2E")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#F26C21")}
                onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(4px)"; e.currentTarget.style.boxShadow = "0 1px 0 #C9530C"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 5px 0 #C9530C"; }}
              >
                Finalizar pedido
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
