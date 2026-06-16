"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";
import axios from "axios";

interface NotifPrefs {
  notifWhatsapp: boolean;
  notifEmail: boolean;
  notifPromos: boolean;
  notifReorder: boolean;
}

const PREFS = [
  {
    key: "notifWhatsapp" as keyof NotifPrefs,
    label: "WhatsApp — Status do pedido",
    desc: "Receba atualizações sobre confirmação, produção e entrega via WhatsApp.",
    icon: "📱",
  },
  {
    key: "notifEmail" as keyof NotifPrefs,
    label: "E-mail — Confirmação e status",
    desc: "Receba a confirmação do pedido e atualizações de status por e-mail.",
    icon: "📧",
  },
  {
    key: "notifPromos" as keyof NotifPrefs,
    label: "Novidades e promoções",
    desc: "Fique por dentro dos novos produtos e ofertas especiais.",
    icon: "🎉",
  },
  {
    key: "notifReorder" as keyof NotifPrefs,
    label: "Lembrete de recompra",
    desc: "Receba um aviso quando estiver na hora de reabastecer o estoque de papinhas.",
    icon: "🔔",
  },
];

export default function NotificacoesPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>({
    notifWhatsapp: false,
    notifEmail: true,
    notifPromos: false,
    notifReorder: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get("/api/minha-conta/notificacoes").then(({ data }) => setPrefs(data)).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await axios.put("/api/minha-conta/notificacoes", prefs);
      setSuccess("Preferências salvas!");
    } catch {
      setError("Erro ao salvar preferências.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof NotifPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSuccess("");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#F26C21" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Bell size={20} color="#F26C21" />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", margin: 0 }}>Notificações</h1>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        {PREFS.map(({ key, label, desc, icon }, i) => (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              padding: "16px 18px",
              borderTop: i > 0 ? "1px solid #f5f0e8" : "none",
              cursor: "pointer",
            }}
            onClick={() => toggle(key)}
          >
            <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1c1917" }}>{label}</p>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: "#78716c", lineHeight: 1.4 }}>{desc}</p>
            </div>
            {/* Toggle */}
            <div
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: prefs[key] ? "#F26C21" : "#e5e7eb",
                position: "relative",
                flexShrink: 0,
                transition: "background 0.2s",
                cursor: "pointer",
              }}
            >
              <div style={{
                position: "absolute",
                top: 2,
                left: prefs[key] ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                transition: "left 0.2s",
              }} />
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#be123c" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#166534" }}>
          {success}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          background: "#F26C21",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "12px 0",
          fontSize: 14,
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={15} />}
        Salvar preferências
      </button>

      <p style={{ fontSize: 12, color: "#a8a29e", textAlign: "center", margin: 0 }}>
        Os canais de notificação (WhatsApp e e-mail) serão ativados conforme disponibilidade do sistema.
      </p>
    </div>
  );
}
