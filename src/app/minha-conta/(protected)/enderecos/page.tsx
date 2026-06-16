"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, Star, Trash2, Loader2, X } from "lucide-react";
import axios from "axios";

interface Address {
  id: string;
  label: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
  deliveryZone: { id: string; name: string; fee: number } | null;
}

const emptyForm = { label: "Casa", cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "SP" };

export default function EnderecosPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function load() {
    setLoading(true);
    axios.get("/api/minha-conta/enderecos").then(({ data }) => setAddresses(data)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function lookupCep() {
    const raw = form.cep.replace(/\D/g, "");
    if (raw.length !== 8) return;
    setCepLoading(true);
    try {
      const { data } = await axios.get(`/api/cep?cep=${raw}`);
      setForm((f) => ({
        ...f,
        street: data.street || f.street,
        neighborhood: data.neighborhood || f.neighborhood,
        city: data.city || f.city,
        state: data.state || f.state,
      }));
    } catch {}
    setCepLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await axios.post("/api/minha-conta/enderecos", {
        ...form,
        isDefault: addresses.length === 0,
      });
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault(id: string) {
    await axios.patch(`/api/minha-conta/enderecos/${id}`, { isDefault: true });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este endereço?")) return;
    await axios.delete(`/api/minha-conta/enderecos/${id}`);
    load();
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", margin: 0 }}>Meus Endereços</h1>
        <button
          onClick={() => setShowForm(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#F26C21", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={15} /> Adicionar
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#F26C21" }} />
        </div>
      ) : addresses.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
          <MapPin size={36} style={{ color: "#e8dcc8", margin: "0 auto 12px" }} />
          <p style={{ color: "#a8a29e", margin: 0, fontSize: 14 }}>Nenhum endereço cadastrado.</p>
          <p style={{ color: "#c4b8a8", margin: "4px 0 0", fontSize: 13 }}>Adicione um endereço para agilizar seus pedidos.</p>
        </div>
      ) : (
        addresses.map((addr) => (
          <div key={addr.id} style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.05)", border: addr.isDefault ? "1.5px solid #F26C21" : "1.5px solid transparent" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1c1917" }}>{addr.label}</span>
                  {addr.isDefault && (
                    <span style={{ background: "#fff7ed", color: "#F26C21", fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 20, border: "1px solid #fed7aa" }}>
                      Padrão
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "#57534e" }}>
                  {addr.street}, {addr.number}{addr.complement ? ` — ${addr.complement}` : ""}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#78716c" }}>
                  {addr.neighborhood} · {addr.city}/{addr.state}
                </p>
                {addr.deliveryZone && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#a8a29e" }}>
                    Zona: {addr.deliveryZone.name} · Taxa: R$ {addr.deliveryZone.fee.toFixed(2)}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {!addr.isDefault && (
                  <button
                    onClick={() => handleSetDefault(addr.id)}
                    title="Definir como padrão"
                    style={{ background: "#fff7ed", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#F26C21" }}
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(addr.id)}
                  title="Remover"
                  style={{ background: "#fff1f2", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#e11d48" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Add form modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Novo endereço</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#a8a29e" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Apelido</label>
                <input type="text" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={inputStyle} placeholder="Ex: Casa, Trabalho" />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>CEP</label>
                <input
                  type="text"
                  value={form.cep}
                  onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))}
                  onBlur={lookupCep}
                  placeholder="00000-000"
                  required
                  style={inputStyle}
                />
                {cepLoading && <p style={{ fontSize: 12, color: "#a8a29e", margin: "4px 0 0" }}>Buscando CEP...</p>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Rua</label>
                  <input type="text" value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} required style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Número</label>
                  <input type="text" value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} required style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Complemento</label>
                <input type="text" value={form.complement} onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))} placeholder="Apto, bloco..." style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Bairro</label>
                <input type="text" value={form.neighborhood} onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))} required style={inputStyle} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Cidade</label>
                  <input type="text" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} required style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Estado</label>
                  <input type="text" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} maxLength={2} style={inputStyle} />
                </div>
              </div>

              {error && (
                <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#be123c" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{ flex: 1, background: "#f5f0e8", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 500, cursor: "pointer", color: "#78716c" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ flex: 2, background: "#F26C21", color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  {saving && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
