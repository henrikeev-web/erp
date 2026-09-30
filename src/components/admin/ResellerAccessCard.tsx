"use client";

import { useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { Copy, KeyRound, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Props { customerId: string; type: string; onChanged: () => void }

const errMsg = (e: unknown) => (axios.isAxiosError(e) && e.response?.data?.error ? String(e.response.data.error) : "Erro ao salvar");

/**
 * Revendedor = único tipo de cliente que enxerga o preço de revenda. Cadastro e senha são só do administrador.
 * A senha provisória é exibida UMA vez aqui (não fica guardada em texto).
 */
export default function ResellerAccessCard({ customerId, type, onChanged }: Props) {
  const { data: session } = useSession();
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(session?.user?.role ?? "");
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const isReseller = type === "RESELLER";

  if (!isAdmin && !isReseller) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); onChanged(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  const resetPassword = (password?: string) => run(async () => {
    const { data } = await axios.post(`/api/clientes/${customerId}/senha`, password ? { password } : {});
    setTempPassword(data.tempPassword ?? null);
    setCustom("");
  });

  const makeReseller = () => {
    if (!window.confirm("Tornar este cliente REVENDEDOR?\n\nEle passará a enxergar os preços de revenda e poderá faturar pedidos. Uma senha provisória será gerada.")) return;
    run(async () => {
      await axios.put(`/api/clientes/${customerId}`, { type: "RESELLER" });
      const { data } = await axios.post(`/api/clientes/${customerId}/senha`, {});
      setTempPassword(data.tempPassword ?? null);
    });
  };

  const makeRetail = () => {
    if (!window.confirm("Voltar este cliente para CLIENTE COMUM?\n\nEle deixa de ver preços de revenda e de faturar.")) return;
    run(async () => { await axios.put(`/api/clientes/${customerId}`, { type: "RETAIL" }); setTempPassword(null); });
  };

  return (
    <Card className={isReseller ? "border-amber-200 bg-amber-50/40" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
          <Store className="w-4 h-4" /> Revendedor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isReseller ? (
          <>
            <p className="text-zinc-600">
              Este cliente é <strong>revendedor</strong>: vê os <strong>preços de revenda</strong> no cardápio quando entra com o login dele e pode faturar pedidos.
              Nenhum outro cliente enxerga esses preços.
            </p>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => resetPassword()}><KeyRound className="w-3.5 h-3.5 mr-1.5" /> Gerar nova senha</Button>
                <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={makeRetail}>Voltar a cliente comum</Button>
              </div>
            )}
            {isAdmin && (
              <div className="flex gap-2">
                <Input type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Ou defina uma senha (mín. 8)" className="h-9" />
                <Button size="sm" variant="outline" disabled={busy || custom.length < 8} onClick={() => resetPassword(custom)}>Definir</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-zinc-600">Cliente comum. Revendedores são cadastrados apenas por administradores e não se cadastram sozinhos.</p>
            <Button size="sm" variant="outline" disabled={busy} onClick={makeReseller}>Tornar revendedor</Button>
          </>
        )}

        {tempPassword && (
          <div className="rounded-xl border border-amber-300 bg-amber-100/70 p-3">
            <p className="text-xs font-semibold text-amber-900">Senha provisória — anote agora, ela não será mostrada de novo</p>
            <div className="flex items-center gap-2 mt-1.5">
              <code className="flex-1 bg-white rounded-lg px-3 py-2 text-base font-mono tracking-wider">{tempPassword}</code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(tempPassword)}><Copy className="w-3.5 h-3.5" /></Button>
            </div>
            <p className="text-[11px] text-amber-800 mt-1.5">O login é o telefone ou e-mail cadastrado, em Minha Conta.</p>
          </div>
        )}
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      </CardContent>
    </Card>
  );
}
