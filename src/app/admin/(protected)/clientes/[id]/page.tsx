"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft, Phone, Mail, Edit2, Baby, Star, ShoppingBag,
  MapPin, RefreshCw, Save, X, AlertCircle,
} from "lucide-react";
import { formatCurrency, ageLabel } from "@/lib/utils";
import OrderStatusBadge from "@/components/admin/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ResellerAccessCard from "@/components/admin/ResellerAccessCard";

const TIER_LABELS: Record<string, string> = {
  BRONZE: "Bronze", SILVER: "Prata", GOLD: "Ouro", PLATINUM: "Platina",
};
const TIER_COLORS: Record<string, string> = {
  BRONZE: "bg-orange-100 text-orange-700",
  SILVER: "bg-zinc-100 text-zinc-600",
  GOLD: "bg-yellow-100 text-yellow-700",
  PLATINUM: "bg-blue-100 text-blue-700",
};

interface Child { id: string; name: string; birthDate: string; notes: string | null }
interface Address { id: string; label: string; street: string; number: string; neighborhood: string; city: string; state: string; cep: string; isDefault: boolean }
interface LoyaltyTx { id: string; type: string; points: number; description: string | null; createdAt: string }
interface OrderItem { name: string; quantity: number }
interface Order { id: string; number: number; status: string; total: number; createdAt: string; items: OrderItem[] }

interface Customer {
  id: string; name: string; phone: string; email: string | null; cpf: string | null; type: string;
  active: boolean; notes: string | null; createdAt: string; lastOrderAt: string | null;
  children: Child[];
  addresses: Address[];
  loyaltyCard: { points: number; tier: string; transactions: LoyaltyTx[] } | null;
  orders: Order[];
  _count: { orders: number };
}

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", cpf: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/clientes/${id}`);
      setCustomer(data);
      setEditForm({ name: data.name, email: data.email ?? "", cpf: data.cpf ?? "", notes: data.notes ?? "" });
    } catch {
      router.push("/admin/clientes");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function saveEdit() {
    if (!customer) return;
    setSaving(true);
    try {
      await axios.put(`/api/clientes/${id}`, editForm);
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!customer) return;
    setToggling(true);
    try {
      await axios.put(`/api/clientes/${id}`, { name: customer.name, active: !customer.active });
      load();
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-6 h-6 animate-spin text-zinc-300" />
      </div>
    );
  }
  if (!customer) return null;

  const totalSpent = customer.orders.reduce((s, o) => s + o.total, 0);
  const avgTicket = customer._count.orders > 0 ? totalSpent / customer._count.orders : 0;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/admin/clientes" className="text-zinc-400 hover:text-zinc-900 transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold shrink-0">
              {customer.name[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-zinc-900">{customer.name}</h1>
                {!customer.active && <Badge variant="destructive">Inativo</Badge>}
                {customer.type === "RESELLER" && <span className="text-xs px-2 py-1 rounded-full font-semibold bg-amber-100 text-amber-800">Revendedor</span>}
                {customer.loyaltyCard && (
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${TIER_COLORS[customer.loyaltyCard.tier]}`}>
                    <Star className="w-3 h-3 inline mr-1" />
                    {TIER_LABELS[customer.loyaltyCard.tier]} · {customer.loyaltyCard.points} pts
                  </span>
                )}
              </div>
              <p className="text-zinc-500 text-sm mt-0.5">
                Cliente desde {format(new Date(customer.createdAt), "MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={toggleActive} disabled={toggling}>
            {toggling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : (customer.active ? "Desativar" : "Reativar")}
          </Button>
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => setEditing(true)}>
            <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Editar
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pedidos", value: String(customer._count.orders) },
          { label: "Total gasto", value: formatCurrency(totalSpent) },
          { label: "Ticket médio", value: avgTicket > 0 ? formatCurrency(avgTicket) : "—" },
          { label: "Último pedido", value: customer.lastOrderAt ? format(new Date(customer.lastOrderAt), "dd/MM/yy", { locale: ptBR }) : "Nunca" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-zinc-100 p-4">
            <p className="text-xs text-zinc-400">{s.label}</p>
            <p className="text-lg font-bold text-zinc-900 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      <ResellerAccessCard customerId={customer.id} type={customer.type} onChanged={load} />

      <div className="grid md:grid-cols-2 gap-4">
        {/* Contato */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <a
              href={`https://wa.me/55${customer.phone.replace(/\D/g, "")}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-green-600 hover:underline font-medium"
            >
              <Phone className="w-4 h-4" /> {customer.phone}
            </a>
            {customer.email && (
              <div className="flex items-center gap-2 text-zinc-600">
                <Mail className="w-4 h-4 text-zinc-400" /> {customer.email}
              </div>
            )}
            {customer.cpf && <p className="text-zinc-500">CPF: {customer.cpf}</p>}
            {customer.notes && (
              <p className="text-zinc-500 italic bg-zinc-50 rounded-xl px-3 py-2">{customer.notes}</p>
            )}
          </CardContent>
        </Card>

        {/* Filhos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
              <Baby className="w-4 h-4" /> Filhos ({customer.children.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customer.children.length === 0 ? (
              <p className="text-sm text-zinc-400">Nenhum filho cadastrado</p>
            ) : (
              <div className="space-y-2.5">
                {customer.children.map((child) => {
                  const months = Math.floor((Date.now() - new Date(child.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
                  return (
                    <div key={child.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{child.name}</p>
                        <p className="text-xs text-zinc-400">
                          {format(new Date(child.birthDate), "dd/MM/yyyy")}
                        </p>
                      </div>
                      <span className="text-xs bg-orange-50 text-orange-600 px-2.5 py-1 rounded-full font-medium">
                        {ageLabel(months)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Endereços */}
      {customer.addresses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Endereços
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {customer.addresses.map((addr) => (
              <div key={addr.id} className="flex items-start gap-3 text-sm">
                <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full mt-0.5 shrink-0">{addr.label}</span>
                <p className="text-zinc-700">
                  {addr.street}, {addr.number} — {addr.neighborhood}, {addr.city}/{addr.state}
                  {addr.isDefault && <span className="ml-2 text-xs text-orange-500">(principal)</span>}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Fidelidade */}
      {customer.loyaltyCard && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
              <Star className="w-4 h-4" /> Fidelidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className={`px-3 py-1.5 rounded-xl text-sm font-bold ${TIER_COLORS[customer.loyaltyCard.tier]}`}>
                {TIER_LABELS[customer.loyaltyCard.tier]}
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{customer.loyaltyCard.points}</p>
                <p className="text-xs text-zinc-400">pontos acumulados</p>
              </div>
            </div>
            {customer.loyaltyCard.transactions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-zinc-400 font-medium uppercase mb-2">Histórico recente</p>
                {customer.loyaltyCard.transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 border-zinc-50">
                    <div>
                      <p className="text-zinc-700">{tx.description ?? tx.type}</p>
                      <p className="text-xs text-zinc-400">{format(new Date(tx.createdAt), "dd/MM/yy", { locale: ptBR })}</p>
                    </div>
                    <span className={`font-medium ${tx.points > 0 ? "text-green-600" : "text-red-500"}`}>
                      {tx.points > 0 ? "+" : ""}{tx.points} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pedidos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Pedidos ({customer._count.orders})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {customer.orders.length === 0 ? (
            <p className="text-sm text-zinc-400 px-6 pb-4">Nenhum pedido registrado</p>
          ) : (
            <div className="divide-y divide-zinc-50">
              {customer.orders.map((order) => (
                <Link key={order.id} href={`/admin/pedidos/${order.id}`}
                  className="flex items-center gap-4 px-6 py-3 hover:bg-zinc-50 transition-colors">
                  <span className="text-sm font-bold text-zinc-400 w-10 shrink-0">#{order.number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-700 truncate">
                      {order.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                    </p>
                    <p className="text-xs text-zinc-400">{format(new Date(order.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}</p>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <p className="text-sm font-bold text-zinc-900">{formatCurrency(order.total)}</p>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de edição */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(false); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">Editar cliente</h2>
              <button onClick={() => setEditing(false)} className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500">Nome *</label>
                <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">E-mail</label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">CPF</label>
                <Input value={editForm.cpf} onChange={(e) => setEditForm(f => ({ ...f, cpf: e.target.value }))} className="mt-1" placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Observações</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-zinc-200 rounded-xl text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={saveEdit} disabled={saving || !editForm.name}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
