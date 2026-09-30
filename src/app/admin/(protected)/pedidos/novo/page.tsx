"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { ArrowLeft, Minus, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NewCustomerModal from "@/components/admin/NewCustomerModal";

interface Customer { id: string; name: string; phone: string; type: string }
interface Zone { id: string; name: string; fee: number; freeAbove: number | null; minOrder: number }
interface Address { id: string; label: string; street: string; number: string; neighborhood: string; city: string; deliveryZone: Zone | null }
interface Product { id: string; name: string; price: number; resalePrice: number | null; stockItem: { quantity: number } | null }

const PAYMENTS = [
  { value: "PIX", label: "PIX" }, { value: "CASH", label: "Dinheiro" },
  { value: "CREDIT_CARD", label: "Cartão de crédito" }, { value: "DEBIT_CARD", label: "Cartão de débito" },
];
const cls = "w-full h-10 text-sm border border-zinc-200 rounded-xl px-3 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";
const errText = (e: unknown, f: string) => (axios.isAxiosError(e) && e.response?.data?.error ? String(e.response.data.error) : f);
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function NovoPedidoPage() {
  const router = useRouter();

  // ── cliente ──
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Customer[]>([]);
  const [newCustomer, setNewCustomer] = useState(false);

  // ── entrega ──
  const [type, setType] = useState<"DELIVERY" | "PICKUP">("PICKUP");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string>("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [couriers, setCouriers] = useState<{ id: string; name: string }[]>([]);
  const [courierId, setCourierId] = useState("");
  const [addr, setAddr] = useState({ cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "SP" });

  // ── itens ──
  const [products, setProducts] = useState<Product[]>([]);
  const [pq, setPq] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});

  // ── desconto / pagamento ──
  const [dType, setDType] = useState<"PERCENT" | "VALUE">("PERCENT");
  const [dAmount, setDAmount] = useState("");
  const [dNote, setDNote] = useState("");
  const [method, setMethod] = useState("PIX");
  const [invoiceDays, setInvoiceDays] = useState("30");
  const [markPaid, setMarkPaid] = useState(false);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isReseller = customer?.type === "RESELLER";
  const canInvoice = !!customer && customer.type !== "RETAIL";

  useEffect(() => {
    axios.get("/api/produtos", { params: { includeInactive: true } }).then(({ data }) => setProducts(data.filter((p: Product & { active: boolean }) => p.active)));
    axios.get("/api/zonas-entrega").then(({ data }) => setZones(data));
    axios.get("/api/entregadores").then(({ data }) => setCouriers(data));
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => axios.get("/api/clientes", { params: { q: q.trim(), limit: 8 } }).then(({ data }) => setFound(data.customers)), 250);
    return () => clearTimeout(t);
  }, [q]);

  function pickCustomer(c: Customer | null) {
    setCustomer(c); setQ(""); setFound([]); setAddresses([]); setAddressId("");
    if (c && !["RESELLER", "FRANCHISEE"].includes(c.type) && method === "INVOICE") setMethod("PIX");
    if (c) axios.get(`/api/clientes/${c.id}/enderecos`).then(({ data }) => { setAddresses(data); setAddressId(data[0]?.id ?? "new"); });
  }

  // ── cálculo (espelha o servidor; o servidor é quem vale) ──
  const unitPrice = (p: Product) => (isReseller ? p.resalePrice ?? p.price : p.price);
  const lines = useMemo(() => products.filter((p) => qty[p.id] > 0).map((p) => ({ p, n: qty[p.id], unit: isReseller ? p.resalePrice ?? p.price : p.price })), [products, qty, isReseller]);
  const subtotal = r2(lines.reduce((s, l) => s + l.unit * l.n, 0));

  const selectedAddr = addresses.find((a) => a.id === addressId);
  const zone = type === "DELIVERY" ? (selectedAddr?.deliveryZone ?? zones.find((z) => z.id === zoneId) ?? null) : null;
  const fee = zone ? (zone.freeAbove && subtotal >= zone.freeAbove ? 0 : zone.fee) : 0;
  const base = r2(subtotal + fee);

  const dn = parseFloat(dAmount.replace(",", "."));
  const dValid = !dAmount || (dn > 0 && (dType === "PERCENT" ? dn <= 100 : dn <= base));
  const discount = dAmount && dValid ? (dType === "PERCENT" ? r2((base * dn) / 100) : r2(dn)) : 0;
  const total = Math.max(0, r2(base - discount));

  const filteredProducts = useMemo(() => {
    const t = pq.trim().toLowerCase();
    return (t ? products.filter((p) => p.name.toLowerCase().includes(t)) : products).slice(0, 40);
  }, [products, pq]);

  const setN = (id: string, n: number) => setQty((s) => ({ ...s, [id]: Math.max(0, n) }));

  async function submit() {
    setError("");
    if (!customer) return setError("Selecione ou cadastre o cliente");
    if (lines.length === 0) return setError("Adicione ao menos um item");
    if (!dValid) return setError(dType === "PERCENT" ? "Desconto deve ficar entre 0 e 100%" : "Desconto maior que o valor do pedido");
    if (type === "DELIVERY" && addressId === "new" && (!addr.cep || !addr.street || !addr.number || !addr.neighborhood || !addr.city)) return setError("Preencha o endereço de entrega");
    if (type === "DELIVERY" && !zone) return setError("Selecione a zona de entrega");
    if (type === "DELIVERY" && !courierId) return setError("Selecione o entregador (o pedido entra direto em produção)");
    if (method === "INVOICE" && !(parseInt(invoiceDays) >= 1 && parseInt(invoiceDays) <= 120)) return setError("Prazo do faturamento: 1 a 120 dias");

    setSaving(true);
    try {
      let finalAddressId: string | undefined = addressId && addressId !== "new" ? addressId : undefined;
      if (type === "DELIVERY" && addressId === "new") {
        const { data } = await axios.post(`/api/clientes/${customer.id}/enderecos`, { ...addr, label: "Entrega", deliveryZoneId: zone?.id });
        finalAddressId = data.id;
      }
      const { data: order } = await axios.post("/api/pedidos", {
        customerId: customer.id,
        type,
        addressId: type === "DELIVERY" ? finalAddressId : undefined,
        deliveryZoneId: type === "DELIVERY" ? zone?.id : undefined,
        courierId: type === "DELIVERY" ? courierId : undefined,
        paymentMethod: method,
        invoiceDays: method === "INVOICE" ? parseInt(invoiceDays) : undefined,
        markPaid: method !== "INVOICE" ? markPaid : undefined,
        discount: dAmount ? { type: dType, amount: dn, note: dNote || undefined } : undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({ productId: l.p.id, quantity: l.n })),
      });
      router.push(`/admin/pedidos/${order.id}`);
    } catch (e) {
      setError(errText(e, "Erro ao criar pedido"));
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/pedidos" className="w-9 h-9 rounded-xl hover:bg-zinc-100 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Novo pedido</h1>
          <p className="text-zinc-500 text-sm">O pedido já entra em produção</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Cliente */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">1. Cliente</h2>
            {customer ? (
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div>
                  <p className="font-medium text-zinc-900">{customer.name} {isReseller && <span className="ml-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800">Revendedor</span>}</p>
                  <p className="text-xs text-zinc-500">{customer.phone}{isReseller && " · preços de revenda aplicados"}</p>
                </div>
                <button onClick={() => pickCustomer(null)} className="text-sm text-orange-600 hover:underline">trocar</button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente por nome, telefone ou e-mail…" className="pl-9" />
                    {q.trim().length >= 2 && found.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                        {found.map((c) => (
                          <button key={c.id} onClick={() => pickCustomer(c)} className="block w-full text-left px-3 py-2 text-sm hover:bg-orange-50">
                            {c.name} <span className="text-zinc-400">· {c.phone}</span> {c.type === "RESELLER" && <span className="text-xs text-amber-700 font-semibold">Revendedor</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button variant="outline" onClick={() => setNewCustomer(true)}><UserPlus className="w-4 h-4 mr-1.5" /> Novo cliente</Button>
                </div>
              </>
            )}
          </section>

          {/* Entrega */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">2. Entrega</h2>
            <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
              {([["PICKUP", "Retirada"], ["DELIVERY", "Entrega"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setType(v)} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${type === v ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>{l}</button>
              ))}
            </div>
            {type === "DELIVERY" && customer && (
              <div className="space-y-3">
                <select className={cls} value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                  {addresses.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.street}, {a.number} — {a.neighborhood}</option>)}
                  <option value="new">+ Novo endereço</option>
                </select>
                {addressId === "new" && (
                  <div className="grid grid-cols-6 gap-2">
                    <Input className="col-span-2" placeholder="CEP" value={addr.cep} onChange={(e) => setAddr({ ...addr, cep: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
                    <Input className="col-span-4" placeholder="Rua" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} />
                    <Input className="col-span-2" placeholder="Nº" value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} />
                    <Input className="col-span-4" placeholder="Complemento" value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} />
                    <Input className="col-span-3" placeholder="Bairro" value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} />
                    <Input className="col-span-3" placeholder="Cidade" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
                  </div>
                )}
                {(!selectedAddr?.deliveryZone) && (
                  <select className={cls} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                    <option value="">Selecione a zona de entrega…</option>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {formatCurrency(z.fee)}</option>)}
                  </select>
                )}
                <div>
                  <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Entregador *</label>
                  <select className={cls} value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                    <option value="">Selecione quem fará a entrega…</option>
                    {couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {couriers.length === 0 && <p className="text-xs text-red-600 mt-1">Nenhum entregador cadastrado — peça a um administrador (menu Entregadores).</p>}
                </div>
                {zone && subtotal > 0 && subtotal < zone.minOrder && <p className="text-xs text-red-600">Pedido mínimo para esta zona: {formatCurrency(zone.minOrder)}</p>}
              </div>
            )}
            {type === "DELIVERY" && !customer && <p className="text-sm text-zinc-500">Selecione o cliente para escolher o endereço.</p>}
          </section>

          {/* Itens */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">3. Itens</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Buscar produto…" className="pl-9" />
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-50 border border-zinc-100 rounded-xl">
              {filteredProducts.map((p) => {
                const stock = p.stockItem?.quantity;
                const n = qty[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p>
                      <p className="text-xs text-zinc-500">
                        {formatCurrency(unitPrice(p))}{isReseller && p.resalePrice ? ` (revenda; normal ${formatCurrency(p.price)})` : ""}
                        {stock !== undefined && <span className={stock <= 0 ? "text-red-600" : ""}> · estoque {stock}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setN(p.id, n - 1)} disabled={n === 0} className="w-7 h-7 rounded-lg border border-zinc-200 flex items-center justify-center disabled:opacity-30"><Minus className="w-3.5 h-3.5" /></button>
                      <input value={n || ""} onChange={(e) => setN(p.id, parseInt(e.target.value) || 0)} placeholder="0" inputMode="numeric" className="w-12 h-7 text-center text-sm border border-zinc-200 rounded-lg" />
                      <button onClick={() => setN(p.id, n + 1)} className="w-7 h-7 rounded-lg border border-zinc-200 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Pagamento */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">4. Pagamento</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENTS.map((m) => (
                <button key={m.value} onClick={() => setMethod(m.value)} className={`py-2.5 rounded-xl border text-sm font-medium ${method === m.value ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-600"}`}>{m.label}</button>
              ))}
              {canInvoice && <button onClick={() => setMethod("INVOICE")} className={`py-2.5 rounded-xl border text-sm font-medium ${method === "INVOICE" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-600"}`}>🧾 Faturado</button>}
            </div>
            {method === "INVOICE" ? (
              <div className="max-w-xs">
                <label className="text-xs font-medium text-zinc-600 mb-1.5 block">Prazo (dias, a partir de hoje)</label>
                <Input type="number" min="1" max="120" value={invoiceDays} onChange={(e) => setInvoiceDays(e.target.value)} />
                <p className="text-[11px] text-zinc-500 mt-1">Gera uma conta a receber no financeiro.</p>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} /> Já recebido (marcar como pago)</label>
            )}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observações do pedido" className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </section>
        </div>

        {/* Resumo */}
        <aside className="lg:sticky lg:top-6 self-start space-y-4">
          <section className="bg-white rounded-2xl border border-zinc-100 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">Resumo</h2>
            {lines.length === 0 ? <p className="text-sm text-zinc-400">Nenhum item</p> : (
              <div className="space-y-1.5">
                {lines.map((l) => (
                  <div key={l.p.id} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{l.n}× {l.p.name}</span>
                    <span className="flex items-center gap-2 shrink-0">{formatCurrency(l.unit * l.n)}<button onClick={() => setN(l.p.id, 0)} aria-label="Remover"><Trash2 className="w-3.5 h-3.5 text-zinc-300 hover:text-red-500" /></button></span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-zinc-100 pt-3 space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Desconto no pedido</p>
              <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
                {([["PERCENT", "%"], ["VALUE", "R$"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setDType(v)} className={`flex-1 py-1 rounded-lg text-sm font-medium ${dType === v ? "bg-white shadow-sm" : "text-zinc-500"}`}>{l}</button>
                ))}
              </div>
              <Input type="number" min="0" step="0.01" value={dAmount} onChange={(e) => setDAmount(e.target.value)} placeholder={dType === "PERCENT" ? "0 a 100" : `até ${formatCurrency(base)}`} />
              {!dValid && <p className="text-xs text-red-600">{dType === "PERCENT" ? "Máximo 100%" : `Máximo ${formatCurrency(base)} (itens + frete)`}</p>}
              {dAmount && <Input value={dNote} onChange={(e) => setDNote(e.target.value)} placeholder="Motivo (opcional)" maxLength={200} />}
              <p className="text-[11px] text-zinc-400">Vale para o pedido inteiro (itens + frete).</p>
            </div>

            <div className="border-t border-zinc-100 pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Itens</span><span>{formatCurrency(subtotal)}</span></div>
              {type === "DELIVERY" && <div className="flex justify-between"><span className="text-zinc-500">Frete</span><span>{formatCurrency(fee)}</span></div>}
              {discount > 0 && <div className="flex justify-between text-emerald-600"><span>Desconto</span><span>−{formatCurrency(discount)}</span></div>}
              <div className="flex justify-between text-lg font-bold pt-1"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={submit} disabled={saving}>{saving ? "Criando…" : "Criar pedido e enviar p/ produção"}</Button>
          </section>
        </aside>
      </div>

      {newCustomer && <NewCustomerModal onClose={() => setNewCustomer(false)} onCreated={(c) => { setNewCustomer(false); pickCustomer(c); }} />}
    </div>
  );
}
