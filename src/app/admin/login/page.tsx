"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("E-mail ou senha incorretos");
      setLoading(false);
    } else {
      router.push("/admin");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center mx-auto mb-5">
            <span className="text-white font-bold text-xl tracking-tight">B</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">Banguelas Admin</h1>
          <p className="text-zinc-500 text-sm mt-1.5">Acesse o painel de gestão</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">E-mail</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@banguelas.com.br"
                required
                autoFocus
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">Senha</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-orange-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 px-3 py-2 rounded-xl">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-medium mt-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
