"use client";

import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";
import axios from "axios";
import { formatCurrency } from "@/lib/utils";

interface LoyaltyData {
  loyaltyCard: {
    id: string;
    points: number;
    tier: string;
    transactions: {
      id: string;
      type: string;
      points: number;
      description: string | null;
      createdAt: string;
    }[];
  } | null;
  loyaltyConfig: {
    programEnabled: boolean;
    targetOrders: number;
    minOrderValue: number;
    completionPeriodDays: number;
    rewardType: string;
    rewardValue: number;
    rewardValidDays: number;
  } | null;
}

const TIER_LABEL: Record<string, string> = { BRONZE: "Bronze", SILVER: "Prata", GOLD: "Ouro", PLATINUM: "Platina" };
const TIER_COLOR: Record<string, string> = { BRONZE: "#cd7f32", SILVER: "#9ca3af", GOLD: "#f59e0b", PLATINUM: "#8b5cf6" };
const TX_LABEL: Record<string, string> = { EARN: "Pontos ganhos", REDEEM: "Resgate", EXPIRE: "Expirado", BONUS: "Bônus", ADJUST: "Ajuste" };
const TX_COLOR: Record<string, string> = { EARN: "#22c55e", REDEEM: "#f59e0b", EXPIRE: "#ef4444", BONUS: "#3b82f6", ADJUST: "#a8a29e" };

export default function FidelidadePage() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get("/api/minha-conta/perfil").then(({ data: profile }) => {
      // Fetch loyalty details separately
      Promise.all([
        axios.get(`/api/clientes/${profile.id}`).catch(() => ({ data: null })),
        axios.get("/api/fidelidade/config").catch(() => ({ data: null })),
      ]).then(([clientRes, configRes]) => {
        setData({
          loyaltyCard: clientRes.data?.loyaltyCard ?? null,
          loyaltyConfig: configRes.data ?? null,
        });
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#F26C21" }} />
      </div>
    );
  }

  const card = data?.loyaltyCard;
  const config = data?.loyaltyConfig;
  const tier = card?.tier ?? "BRONZE";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", margin: 0 }}>Fidelidade</h1>

      {/* Tier card */}
      <div style={{
        background: `linear-gradient(135deg, ${TIER_COLOR[tier]}22 0%, ${TIER_COLOR[tier]}08 100%)`,
        border: `2px solid ${TIER_COLOR[tier]}44`,
        borderRadius: 16,
        padding: "20px 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: TIER_COLOR[tier], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Star size={24} color="#fff" fill="#fff" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "#78716c" }}>Seu nível</p>
            <p style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 700, color: TIER_COLOR[tier] }}>
              {TIER_LABEL[tier]}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 14, color: "#57534e" }}>
              {card?.points ?? 0} pontos acumulados
            </p>
          </div>
        </div>
      </div>

      {/* How it works */}
      {config?.programEnabled && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", margin: "0 0 12px" }}>Como funciona</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>🛍️</span>
              <p style={{ margin: 0, fontSize: 13, color: "#57534e" }}>
                A cada {config.targetOrders} pedidos acima de {formatCurrency(config.minOrderValue)}, você ganha um desconto especial!
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>⏱️</span>
              <p style={{ margin: 0, fontSize: 13, color: "#57534e" }}>
                Complete os pedidos em até {config.completionPeriodDays} dias.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>🎁</span>
              <p style={{ margin: 0, fontSize: 13, color: "#57534e" }}>
                Desconto de {config.rewardType === "FIXED" ? formatCurrency(config.rewardValue) : `${config.rewardValue}%`} válido por {config.rewardValidDays} dias após ganhar.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction history */}
      {card?.transactions && card.transactions.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", margin: "0 0 12px" }}>Histórico de pontos</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {card.transactions.map((tx, i) => (
              <div key={tx.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: i > 0 ? "1px solid #f5f0e8" : "none" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: "#1c1917", fontWeight: 500 }}>{TX_LABEL[tx.type] ?? tx.type}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#a8a29e" }}>
                    {tx.description} · {new Date(tx.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: TX_COLOR[tx.type] ?? "#a8a29e" }}>
                  {tx.points > 0 ? "+" : ""}{tx.points} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!card && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
          <Star size={36} style={{ color: "#e8dcc8", margin: "0 auto 12px" }} />
          <p style={{ color: "#a8a29e", margin: 0, fontSize: 14 }}>Faça seu primeiro pedido para começar a acumular pontos!</p>
        </div>
      )}
    </div>
  );
}
