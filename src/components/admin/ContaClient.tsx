"use client";

import { useState } from "react";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, errMsg } from "@/components/admin/financeiro/shared";
import { checkNewPassword, PASSWORD_MIN } from "@/lib/password-policy";

export default function ContaClient({ name, email }: { name: string | null; email: string | null }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function save() {
    setError(""); setDone(false);
    if (!current) return setError("Informe a senha atual");
    const problem = checkNewPassword(next, { email, current });
    if (problem) return setError(problem);
    if (next !== confirm) return setError("A confirmação não confere com a nova senha");
    setSaving(true);
    try {
      await axios.post("/api/conta/senha", { currentPassword: current, newPassword: next });
      setDone(true); setCurrent(""); setNext(""); setConfirm("");
    } catch (e) { setError(errMsg(e)); }
    setSaving(false);
  }

  const type = show ? "text" : "password";
  return (
    <div className="p-6 lg:p-8 max-w-xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Minha conta</h1>
        <p className="text-zinc-500 text-sm">{name ?? "Usuário"}{email ? ` · ${email}` : ""}</p>
      </div>
      <div className="bg-white rounded-2xl border border-zinc-100 p-5 space-y-4">
        <h2 className="font-semibold text-zinc-900">Alterar senha</h2>
        <Field label="Senha atual"><Input type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="Nova senha" hint={`Mínimo de ${PASSWORD_MIN} caracteres, com letras e números.`}><Input type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirmar nova senha"><Input type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
        <label className="flex items-center gap-2 text-sm text-zinc-600"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar senhas</label>
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        {done && <div className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">Senha alterada com sucesso.</div>}
        <div className="flex justify-end"><Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar nova senha"}</Button></div>
      </div>
    </div>
  );
}
