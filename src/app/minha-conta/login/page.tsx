"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import axios from "axios";

type Tab = "login" | "register";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Login form
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("customer-credentials", {
      identifier: identifier.trim(),
      password: loginPassword,
      redirect: false,
    });

    if (result?.error) {
      setError("Telefone/e-mail ou senha incorretos");
      setLoading(false);
    } else {
      router.push("/minha-conta");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (regPassword !== regConfirm) {
      setError("As senhas não coincidem");
      return;
    }
    setLoading(true);
    setError("");

    try {
      await axios.post("/api/minha-conta/register", {
        name: regName,
        phone: regPhone,
        email: regEmail,
        password: regPassword,
      });

      // Auto login after register
      const result = await signIn("customer-credentials", {
        identifier: regPhone.replace(/\D/g, ""),
        password: regPassword,
        redirect: false,
      });

      if (result?.error) {
        setSuccess("Conta criada! Faça login para continuar.");
        setTab("login");
      } else {
        router.push("/minha-conta");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Erro ao criar conta");
    } finally {
      setLoading(false);
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

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#78716c",
    display: "block",
    marginBottom: 6,
    fontWeight: 500,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FBF6EC", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, background: "#F26C21", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 22 }}>B</span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", margin: 0 }}>Minha Conta</h1>
          <p style={{ fontSize: 13, color: "#a8a29e", margin: "4px 0 0" }}>Banguelas Papinhas</p>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", marginBottom: 20, borderBottom: "1px solid #f0e8da" }}>
            {(["login", "register"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); setSuccess(""); }}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 14,
                  fontWeight: tab === t ? 600 : 400,
                  color: tab === t ? "#F26C21" : "#a8a29e",
                  background: "none",
                  border: "none",
                  borderBottom: tab === t ? "2px solid #F26C21" : "2px solid transparent",
                  cursor: "pointer",
                  marginBottom: -1,
                }}
              >
                {t === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {success && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#166534", marginBottom: 16 }}>
              {success}
            </div>
          )}

          {error && (
            <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#be123c", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {tab === "login" ? (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Telefone ou e-mail</label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="(11) 99999-0000"
                  required
                  autoFocus
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Senha</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: "#F26C21",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 0",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                Entrar
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome completo</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Maria Silva"
                  required
                  minLength={2}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Telefone (WhatsApp) *</label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="(11) 99999-0000"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>E-mail (opcional)</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="maria@email.com"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Senha</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Confirmar senha</label>
                <input
                  type="password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: "#F26C21",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 0",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                Criar conta
              </button>
            </form>
          )}

          <p style={{ textAlign: "center", fontSize: 12, color: "#a8a29e", marginTop: 16 }}>
            Já fez um pedido? Cadastre-se com o mesmo telefone para acessar seu histórico.
          </p>
        </div>

        <p style={{ textAlign: "center", marginTop: 16 }}>
          <a href="/cardapio" style={{ fontSize: 13, color: "#a8a29e", textDecoration: "none" }}>
            ← Voltar ao cardápio
          </a>
        </p>
      </div>
    </div>
  );
}
