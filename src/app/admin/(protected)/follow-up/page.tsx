"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, Phone, Baby, RefreshCw, MessageSquare, Check } from "lucide-react";
import { formatCurrency, ageLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Customer {
  id: string; name: string; phone: string; email: string | null;
  lastOrderAt: string | null; createdAt: string;
  children: { id: string; name: string; birthDate: string }[];
  loyaltyCard: { points: number; tier: string } | null;
  _count: { orders: number };
}

const FILTER_DAYS = [
  { label: "30+ dias", days: 30 },
  { label: "60+ dias", days: 60 },
  { label: "90+ dias", days: 90 },
  { label: "Nunca compraram", days: 0 },
];

const WA_MESSAGES = [
  (name: string) => `Oi ${name.split(" ")[0]}! 👋 Sentimos sua falta na Banguelas! Que tal pedir as papinhas favoritas do seu bebê? Temos novidades deliciosas esperando por vocês 🍼🥰`,
  (name: string) => `Olá ${name.split(" ")[0]}! ✨ Faz um tempinho que não te vemos por aqui na Banguelas. Seu bebê está bem? Temos novos sabores de papinhas supernutritivas! Bora fazer um pedido? 💚`,
  (name: string) => `${name.split(" ")[0]}, oi! 🌟 A Banguelas tem saudades de você e do seu bebê! Que tal retomar a alimentação saudável com nossas papinhas congeladas? É só pedir! 🥕🌽`,
];

export default function FollowUpPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDays, setFilterDays] = useState(30);
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ inativo: "true", limit: "100" });
      if (filterDays > 0) params.set("diasSemPedido", String(filterDays));
      else params.set("semPedido", "true");
      const { data } = await axios.get(`/api/clientes?${params}`);
      setCustomers(data.customers);
    } finally {
      setLoading(false);
    }
  }, [filterDays]);

  useEffect(() => { load(); }, [load]);

  function whatsappMessage(customer: Customer) {
    const msg = WA_MESSAGES[Math.floor(Math.random() * WA_MESSAGES.length)](customer.name);
    const phone = `55${customer.phone.replace(/\D/g, "")}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    setContacted(prev => new Set([...prev, customer.id]));
  }

  function daysSinceOrder(customer: Customer): number | null {
    if (!customer.lastOrderAt) return null;
    return Math.floor((Date.now() - new Date(customer.lastOrderAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Follow-up CRM</h1>
          <p className="text-zinc-500 text-sm">Clientes inativos para reengajamento</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
        {FILTER_DAYS.map(({ label, days }) => (
          <button key={days} onClick={() => setFilterDays(days)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filterDays === days ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Info banner */}
      {!loading && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Bell className="w-5 h-5 text-orange-500 shrink-0" />
          <p className="text-sm text-orange-700">
            <strong>{customers.length}</strong> cliente{customers.length !== 1 ? "s" : ""} {filterDays === 0 ? "que nunca compraram" : `sem pedidos há ${filterDays}+ dias`}.
            {contacted.size > 0 && <span className="ml-1 text-green-700"> {contacted.size} contactado{contacted.size !== 1 ? "s" : ""} nesta sessão.</span>}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Bell className="w-12 h-12 mx-auto mb-3 text-zinc-200" />
          <p>Nenhum cliente nesta categoria</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 divide-y divide-zinc-50">
          {customers.map((customer) => {
            const days = daysSinceOrder(customer);
            const isContacted = contacted.has(customer.id);
            return (
              <div key={customer.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${isContacted ? "bg-green-50" : "hover:bg-zinc-50"}`}>
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold text-sm shrink-0">
                  {customer.name[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-900">{customer.name}</p>
                    {isContacted && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Contactado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {customer.phone}
                    {customer._count.orders > 0 ? ` · ${customer._count.orders} pedido${customer._count.orders !== 1 ? "s" : ""}` : " · Nunca comprou"}
                  </p>
                  {customer.children.length > 0 && (
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {customer.children.map((child) => {
                        const months = Math.floor((Date.now() - new Date(child.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
                        return (
                          <span key={child.id} className="flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                            <Baby className="w-3 h-3" /> {child.name} · {ageLabel(months)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-right mr-2">
                  {days !== null ? (
                    <>
                      <p className={`text-sm font-bold ${days >= 90 ? "text-red-500" : days >= 60 ? "text-amber-500" : "text-zinc-600"}`}>
                        {days}d sem pedido
                      </p>
                      <p className="text-xs text-zinc-400">
                        {format(new Date(customer.lastOrderAt!), "dd/MM/yy", { locale: ptBR })}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400">Nunca comprou</p>
                  )}
                </div>

                <button
                  onClick={() => whatsappMessage(customer)}
                  className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isContacted
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-green-500 text-white hover:bg-green-600"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">{isContacted ? "Enviar de novo" : "WhatsApp"}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
