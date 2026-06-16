"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import axios from "axios";

interface Profile {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  cpf: string | null;
  loyaltyCard: { points: number; tier: string } | null;
}

const TIER_LABEL: Record<string, string> = {
  BRONZE: "Bronze",
  SILVER: "Prata",
  GOLD: "Ouro",
  PLATINUM: "Platina",
};

const TIER_COLOR: Record<string, string> = {
  BRONZE: "#cd7f32",
  SILVER: "#9ca3af",
  GOLD: "#f59e0b",
  PLATINUM: "#8b5cf6",
};

export default function PerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({ name: "", email: "", cpf: "" });

  useEffect(() => {
    axios.get("/api/minha-conta/perfil").then(({ data }) => {
      setProfile(data);
      setForm({ name: data.name, email: data.email ?? "", cpf: data.cpf ?? "" });
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await axios.put("/api/minha-conta/perfil", form);
      setSuccess("Dados atualizados com sucesso!");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #e8dcc8",
    borderRadius: 10,
    fontSize: 14,
    background: "#fdfaf6",
    outline: "none",
    boxSizing: "border-box",
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#F26C21" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", margin: 0 }}>Meu Perfil</h1>

      {/* Loyalty badge */}
      {profile?.loyaltyCard && (
        <div style={{
          background: "#fff",
          borderRadius: 14,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: TIER_COLOR[profile.loyaltyCard.tier] ?? "#cd7f32",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{ color: "#fff", fontSize: 18 }}>★</span>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "#a8a29e" }}>Seu nível de fidelidade</p>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TIER_COLOR[profile.loyaltyCard.tier] }}>
              {TIER_LABEL[profile.loyaltyCard.tier]} · {profile.loyaltyCard.points} pts
            </p>
          </div>
        </div>
      )}

      {/* Profile form */}
      <div style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", margin: "0 0 16px" }}>Dados pessoais</h2>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 6, fontWeight: 500 }}>Nome</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              minLength={2}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 6, fontWeight: 500 }}>
              Telefone <span style={{ color: "#a8a29e", fontWeight: 400 }}>(não editável)</span>
            </label>
            <input type="tel" value={profile?.phone ?? ""} disabled style={{ ...inputStyle, background: "#f5f0e8", color: "#a8a29e" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 6, fontWeight: 500 }}>E-mail</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Opcional"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 6, fontWeight: 500 }}>CPF</label>
            <input
              type="text"
              value={form.cpf}
              onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
              placeholder="000.000.000-00 (opcional)"
              style={inputStyle}
            />
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
            type="submit"
            disabled={saving}
            style={{
              background: "#F26C21",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "11px 0",
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
            Salvar alterações
          </button>
        </form>
      </div>
    </div>
  );
}
