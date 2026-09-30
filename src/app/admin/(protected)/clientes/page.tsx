"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, UserPlus, Baby, RefreshCw, Star } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency, ageLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import NewCustomerModal from "@/components/admin/NewCustomerModal";

interface Customer {
  id: string; name: string; phone: string; email: string | null;
  active: boolean; createdAt: string; lastOrderAt: string | null; type: string;
  children: { id: string; name: string; birthDate: string }[];
  loyaltyCard: { points: number; tier: string } | null;
  _count: { orders: number };
}

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "resellers">("all");
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (filter === "inactive") params.set("inativo", "true");
      if (filter === "resellers") params.set("tipo", "RESELLER");
      params.set("limit", "50");
      const { data } = await axios.get(`/api/clientes?${params}`);
      setCustomers(data.customers);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const tierColor: Record<string, string> = {
    BRONZE: "bg-orange-100 text-orange-700",
    SILVER: "bg-zinc-100 text-zinc-600",
    GOLD: "bg-yellow-100 text-yellow-700",
    PLATINUM: "bg-blue-100 text-blue-700",
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Clientes</h1>
          <p className="text-zinc-500 text-sm">{total} cliente{total !== 1 ? "s" : ""}</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setNewOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> Novo cliente
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone ou e-mail..." className="pl-9" />
        </div>

        <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
          {[
            { value: "all", label: "Todos" },
            { value: "active", label: "Ativos" },
            { value: "inactive", label: "Inativos +30d" },
            { value: "resellers", label: "Revendedores" },
          ].map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value as typeof filter)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === f.value ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-5 h-5 animate-spin text-zinc-300" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">Nenhum cliente encontrado</div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {customers.map((c) => (
              <Link key={c.id} href={`/admin/clientes/${c.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 transition-colors">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold text-sm shrink-0">
                  {c.name[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-900">{c.name}</p>
                    {!c.active && <Badge variant="destructive" className="text-xs">Inativo</Badge>}
                    {c.type === "RESELLER" && <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800">Revendedor</span>}
                    {c.loyaltyCard && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierColor[c.loyaltyCard.tier] ?? "bg-zinc-100"}`}>
                        <Star className="w-3 h-3 inline mr-0.5" />{c.loyaltyCard.points}pts
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{c.phone}{c.email && ` · ${c.email}`}</p>
                  {c.children.length > 0 && (
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {c.children.map((child) => (
                        <span key={child.id} className="flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                          <Baby className="w-3 h-3" />
                          {child.name} · {ageLabel(Math.floor((Date.now() - new Date(child.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)))}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-right text-sm">
                  <p className="font-medium text-zinc-900">{c._count.orders} pedido{c._count.orders !== 1 ? "s" : ""}</p>
                  {c.lastOrderAt && (
                    <p className="text-xs text-zinc-400">
                      Último: {format(new Date(c.lastOrderAt), "dd/MM/yy", { locale: ptBR })}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {newOpen && <NewCustomerModal onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); load(); }} />}
    </div>
  );
}
