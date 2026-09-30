"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { safeReturnPath } from "@/lib/google-login";

function CompletarForm() {
  const router = useRouter();
  const next = safeReturnPath(useSearchParams().get("next"));
  const { data: session, update } = useSession();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.post("/api/minha-conta/google/completar", { phone, name: name || undefined });
      await update({ customerId: data.customerId });
      router.push(next);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error ?? "Erro ao salvar" : "Erro ao salvar");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBF6EC", fontFamily: "'Poppins',sans-serif", color: "#4A3526", padding: 20 }}>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 8px 30px rgba(0,0,0,.06)" }}>
        <h1 style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: 24, margin: 0 }}>Falta só o telefone</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#9A8A78" }}>
          Você entrou com o Google{session?.user?.email ? ` (${session.user.email})` : ""}. Informe seu telefone para receber avisos do pedido.
        </p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={session?.user?.name ?? "Seu nome"} style={{ padding: 12, borderRadius: 12, border: "1.5px solid #EBDDC8" }} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(17) 99999-9999" inputMode="tel" required style={{ padding: 12, borderRadius: 12, border: "1.5px solid #EBDDC8" }} />
        {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}
        <button disabled={loading} style={{ background: "#F26C21", color: "#fff", border: "none", borderRadius: 12, padding: 13, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Salvando…" : "Continuar"}
        </button>
      </form>
    </div>
  );
}

export default function CompletarCadastroPage() {
  return (
    <Suspense>
      <CompletarForm />
    </Suspense>
  );
}
