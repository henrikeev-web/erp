"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Created { id: string; name: string; phone: string; type: string }
interface Props { onClose: () => void; onCreated: (c: Created) => void; defaultType?: "RETAIL" | "RESELLER" }

/** Cadastro de cliente pelo painel. "Revendedor" só aparece para administradores. */
export default function NewCustomerModal({ onClose, onCreated, defaultType = "RETAIL" }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isHQ, setIsHQ] = useState(false);
  useEffect(() => { axios.get("/api/unit").then(({ data }) => setIsHQ(data.type === "HQ")).catch(() => setIsHQ(false)); }, []);
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(session?.user?.role ?? "");
  const [type, setType] = useState<"RETAIL" | "RESELLER">(isAdmin ? defaultType : "RETAIL");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [doc, setDoc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<(Created & { tempPassword?: string }) | null>(null);

  async function save() {
    setError("");
    if (name.trim().length < 2) return setError("Informe o nome");
    if (phone.replace(/\D/g, "").length < 10) return setError("Informe o telefone com DDD");
    setSaving(true);
    try {
      const { data } = await axios.post("/api/clientes", {
        name, phone: phone.replace(/\D/g, ""), email: email || undefined, cpf: doc.replace(/\D/g, "") || undefined, type,
      });
      if (data.tempPassword) setCreated(data); // revendedor: mostra a senha provisória antes de fechar
      else onCreated(data);
    } catch (e) {
      const d = axios.isAxiosError(e) ? e.response?.data : null;
      setError(d?.error ?? "Erro ao cadastrar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !created && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h3 className="font-semibold text-zinc-900">{created ? "Revendedor cadastrado" : type === "RESELLER" ? "Novo revendedor" : "Novo cliente"}</h3>
          {!created && <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-lg hover:bg-zinc-100 flex items-center justify-center"><X className="w-4 h-4" /></button>}
        </div>

        {created ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-zinc-600"><strong>{created.name}</strong> já pode entrar em Minha Conta com o telefone ou e-mail e a senha provisória abaixo.</p>
            <div className="rounded-xl border border-amber-300 bg-amber-100/70 p-3">
              <p className="text-xs font-semibold text-amber-900">Anote agora — a senha não será mostrada de novo</p>
              <div className="flex items-center gap-2 mt-1.5">
                <code className="flex-1 bg-white rounded-lg px-3 py-2 text-base font-mono tracking-wider">{created.tempPassword}</code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(created.tempPassword ?? "")}><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div className="flex justify-end"><Button className="bg-orange-500 hover:bg-orange-600" onClick={() => onCreated(created)}>Concluir</Button></div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {isAdmin && (
              <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
                {([["RETAIL", "Cliente"], ["RESELLER", "Revendedor"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setType(v)} className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ${type === v ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>{l}</button>
                ))}
                {/* Franqueado = franquia inteira (unidade + link + usuários): abre o cadastro completo */}
                {isHQ && <button onClick={() => router.push("/admin/franquias?novo=1")} className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 hover:text-zinc-900">Franqueado</button>}
              </div>
            )}
            {type === "RESELLER" && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Revendedor enxerga os preços de revenda e pode faturar pedidos. Será gerada uma senha provisória.</p>}
            <div><label className="text-xs font-medium text-zinc-600 mb-1.5 block">{type === "RESELLER" ? "Nome / razão social *" : "Nome *"}</label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-zinc-600 mb-1.5 block">Telefone *</label><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(17) 99999-9999" /></div>
              <div><label className="text-xs font-medium text-zinc-600 mb-1.5 block">{type === "RESELLER" ? "CNPJ" : "CPF"}</label><Input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="Só números" /></div>
            </div>
            <div><label className="text-xs font-medium text-zinc-600 mb-1.5 block">E-mail</label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Cadastrar"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
