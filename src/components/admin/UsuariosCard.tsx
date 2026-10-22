"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Copy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/components/admin/financeiro/shared";

interface PanelUser { id: string; name: string | null; email: string; role: string; active: boolean; mustChangePassword: boolean }

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super admin", ADMIN: "Administrador", STAFF: "Atendente" };
const copy = (t: string) => navigator.clipboard?.writeText(t);

// Usuários do painel da matriz. Só o administrador da matriz vê (a API devolve 403 para os demais).
export default function UsuariosCard() {
  const [allowed, setAllowed] = useState(false);
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [nu, setNu] = useState({ name: "", email: "", role: "ADMIN" });
  const [secret, setSecret] = useState<{ label: string; password: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => axios.get("/api/usuarios").then(({ data }) => {
    setUsers(data);
    setAllowed(true);
  }).catch(() => setAllowed(false)), []);
  useEffect(() => {
    axios.get("/api/usuarios").then(({ data }) => { setUsers(data); setAllowed(true); }).catch(() => setAllowed(false));
  }, []);

  if (!allowed) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr("");
    try { await fn(); await load(); } catch (e) { setErr(errMsg(e, "Erro ao salvar")); }
    setBusy(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-orange-500" />
        <h2 className="font-semibold text-zinc-900">Usuários do painel</h2>
      </div>
      <p className="text-xs text-zinc-500">Quem acessa o painel da matriz. A senha provisória aparece uma única vez e a pessoa precisa trocá-la no primeiro acesso.</p>

      <div className="border border-zinc-100 rounded-xl divide-y divide-zinc-50">
        {users.map((u) => (
          <div key={u.id} className={`flex items-center gap-2 px-3 py-2 text-sm flex-wrap ${u.active ? "" : "opacity-50"}`}>
            <span className="flex-1 min-w-0">
              <strong>{u.name ?? u.email}</strong>{u.mustChangePassword && <span className="ml-2 text-[11px] text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">aguardando 1º acesso</span>}
              <br /><span className="text-xs text-zinc-500">{u.email}</span>
            </span>
            {u.role === "SUPER_ADMIN" ? (
              <span className="text-xs text-zinc-500">{ROLE_LABEL[u.role]}</span>
            ) : (
              <>
                <select className="h-8 text-xs border border-zinc-200 rounded-lg px-2 bg-white" value={u.role} disabled={busy}
                  onChange={(e) => run(async () => { await axios.patch(`/api/usuarios/${u.id}`, { role: e.target.value }); })}>
                  <option value="ADMIN">Administrador</option><option value="STAFF">Atendente</option>
                </select>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const { data } = await axios.patch(`/api/usuarios/${u.id}`, { resetPassword: true }); setSecret({ label: u.email, password: data.tempPassword }); })}>Nova senha</Button>
                <Button size="sm" variant="ghost" disabled={busy} className={u.active ? "text-red-600" : ""} onClick={() => run(async () => { await axios.patch(`/api/usuarios/${u.id}`, { active: !u.active }); })}>{u.active ? "Desativar" : "Reativar"}</Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input className="flex-1 min-w-32" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="Nome" />
        <Input className="flex-1 min-w-40" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="E-mail" />
        <select className="h-10 text-sm border border-zinc-200 rounded-xl px-2 bg-white" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="ADMIN">Administrador</option><option value="STAFF">Atendente</option></select>
        <Button className="bg-orange-500 hover:bg-orange-600" disabled={busy || nu.name.trim().length < 2 || !nu.email}
          onClick={() => run(async () => { const { data } = await axios.post("/api/usuarios", nu); setSecret({ label: data.email, password: data.tempPassword }); setNu({ name: "", email: "", role: "ADMIN" }); })}>+ Novo usuário</Button>
      </div>

      {secret && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">Senha provisória de {secret.label} — anote agora, não será mostrada de novo</p>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="flex-1 bg-white rounded-lg px-3 py-2 font-mono tracking-wider">{secret.password}</code>
            <Button size="sm" variant="outline" onClick={() => copy(`${window.location.origin}/admin/login\n${secret.label}\n${secret.password}`)}><Copy className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}
      {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}
    </div>
  );
}
