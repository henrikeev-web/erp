"use client";

import { useEffect, useState } from "react";
import { Baby, Plus, Trash2, Loader2, X, Pencil } from "lucide-react";
import axios from "axios";
import { ageInMonths, ageLabel } from "@/lib/utils";

interface Child {
  id: string;
  name: string;
  birthDate: string;
  notes: string | null;
}

const emptyForm = { name: "", birthDate: "", notes: "" };

export default function FilhosPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

  function load() {
    setLoading(true);
    axios.get("/api/minha-conta/filhos").then(({ data }) => setChildren(data)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function openEdit(child: Child) {
    setEditId(child.id);
    setForm({
      name: child.name,
      birthDate: child.birthDate.slice(0, 10),
      notes: child.notes ?? "",
    });
    setError("");
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editId) {
        await axios.patch(`/api/minha-conta/filhos/${editId}`, form);
      } else {
        await axios.post("/api/minha-conta/filhos", form);
      }
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este filho?")) return;
    await axios.delete(`/api/minha-conta/filhos/${id}`);
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

  const AGE_COLORS: [number, string][] = [[4, "#9BCB3B"], [12, "#62C1B1"], [24, "#FAD200"], [Infinity, "#F26C21"]];
  function ageColor(months: number) {
    return AGE_COLORS.find(([max]) => months <= max)?.[1] ?? "#F26C21";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", margin: 0 }}>Meus Filhos</h1>
        <button
          onClick={openNew}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#F26C21", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={15} /> Adicionar
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#F26C21" }} />
        </div>
      ) : children.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, padding: 40, textAlign: "center", boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
          <Baby size={36} style={{ color: "#e8dcc8", margin: "0 auto 12px" }} />
          <p style={{ color: "#a8a29e", margin: 0, fontSize: 14 }}>Nenhum filho cadastrado.</p>
          <p style={{ color: "#c4b8a8", margin: "4px 0 0", fontSize: 13 }}>Cadastre seus filhos para receber recomendações personalizadas de produtos.</p>
        </div>
      ) : (
        children.map((child) => {
          const months = ageInMonths(new Date(child.birthDate));
          return (
            <div key={child.id} style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: ageColor(months), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Baby size={20} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1c1917" }}>{child.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#78716c" }}>
                  {ageLabel(months)} · {new Date(child.birthDate).toLocaleDateString("pt-BR")}
                </p>
                {child.notes && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#a8a29e" }}>{child.notes}</p>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => openEdit(child)}
                  style={{ background: "#fff7ed", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#F26C21" }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(child.id)}
                  style={{ background: "#fff1f2", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#e11d48" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editId ? "Editar filho" : "Novo filho"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#a8a29e" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Nome</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={2} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Data de nascimento</label>
                <input type="date" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#78716c", display: "block", marginBottom: 5, fontWeight: 500 }}>Observações (opcional)</label>
                <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Alergias, preferências..." style={inputStyle} />
              </div>

              {error && (
                <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#be123c" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, background: "#f5f0e8", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 500, cursor: "pointer", color: "#78716c" }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ flex: 2, background: "#F26C21", color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
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
