"use client";

import { useState, useEffect } from "react";
import { X, MapPin, User, CreditCard, CheckCircle2, Loader2, CheckCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCart } from "@/store/cart";
import { formatCurrency, formatCep } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import axios from "axios";
import { RESELLER_INVOICE_DAYS } from "@/lib/invoice-terms";

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  brandId?: string; // legado: a unidade agora vem do host
  /** Sessão de revendedor (decidido no servidor): habilita "Faturado" e desabilita cupom */
  isReseller?: boolean;
}

type Step = "customer" | "address" | "payment" | "confirm" | "success";

interface CustomerData {
  name: string;
  phone: string;
  email: string;
  id?: string;
}

interface AddressData {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  deliveryZoneId?: string;
  deliveryFee?: number;
  zoneName?: string;
}

interface SavedAddress {
  id: string;
  label: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
  deliveryZone: { id: string; name: string; fee: number } | null;
}

const PAYMENT_METHODS = [
  { value: "ONLINE_PIX", label: "PIX Online", icon: "💸", online: true },
  { value: "ONLINE_CREDIT", label: "Cartão Online", icon: "💳", online: true },
  { value: "PIX", label: "PIX na entrega", icon: "📱", online: false },
  { value: "CREDIT_CARD", label: "Cartão na entrega", icon: "💳", online: false },
  { value: "DEBIT_CARD", label: "Débito na entrega", icon: "💳", online: false },
  { value: "CASH", label: "Dinheiro", icon: "💵", online: false },
];

export default function CheckoutModal({ open, onClose, isReseller = false }: CheckoutModalProps) {
  const { items, subtotal, total, clear, couponCode, discount, freeDelivery, setCoupon, clearCoupon } = useCart();
  const { data: session } = useSession();
  const isLoggedIn = session?.user?.role === "CUSTOMER";

  const [step, setStep] = useState<Step>("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [customer, setCustomer] = useState<CustomerData>({ name: "", phone: "", email: "" });
  const [address, setAddress] = useState<AddressData>({
    cep: "", street: "", number: "", complement: "",
    neighborhood: "", city: "", state: "SP",
  });
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [changeAmount, setChangeAmount] = useState("");
  const [invoiceDays, setInvoiceDays] = useState<number>(RESELLER_INVOICE_DAYS[1]);
  const [couponInput, setCouponInput] = useState("");
  const [orderId, setOrderId] = useState("");
  const [orderNumber, setOrderNumber] = useState(0);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState("");

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | "new" | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  const deliveryFee = address.deliveryFee ?? 0;
  const finalTotal = total(orderType === "DELIVERY" ? deliveryFee : 0);

  // Pre-fill customer data from session
  useEffect(() => {
    if (isLoggedIn && session?.user && !customer.name) {
      setCustomer({
        id: session.user.id,
        name: session.user.name ?? "",
        phone: (session.user as { phone?: string }).phone ?? "",
        email: session.user.email ?? "",
      });
    }
  }, [isLoggedIn, session]);

  // Fetch saved addresses when entering address step
  useEffect(() => {
    if (isLoggedIn && step === "address" && orderType === "DELIVERY" && savedAddresses.length === 0) {
      setLoadingAddresses(true);
      axios.get("/api/minha-conta/enderecos").then(({ data }) => {
        setSavedAddresses(data);
        const defaultAddr: SavedAddress = data.find((a: SavedAddress) => a.isDefault) ?? data[0];
        if (defaultAddr) selectSavedAddress(defaultAddr);
      }).finally(() => setLoadingAddresses(false));
    }
  }, [isLoggedIn, step, orderType]);

  function selectSavedAddress(addr: SavedAddress) {
    setSelectedSavedAddressId(addr.id);
    setAddress({
      cep: addr.cep,
      street: addr.street,
      number: addr.number,
      complement: addr.complement ?? "",
      neighborhood: addr.neighborhood,
      city: addr.city,
      state: addr.state,
      deliveryZoneId: addr.deliveryZone?.id,
      deliveryFee: addr.deliveryZone?.fee ?? 0,
      zoneName: addr.deliveryZone?.name,
    });
  }

  async function lookupCep() {
    if (address.cep.replace(/\D/g, "").length !== 8) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`/api/cep?cep=${address.cep}`);
      setAddress((prev) => ({
        ...prev,
        street: data.street || prev.street,
        neighborhood: data.neighborhood || prev.neighborhood,
        city: data.city || prev.city,
        state: data.state || prev.state,
        deliveryZoneId: data.deliveryZone?.id,
        deliveryFee: data.deliveryZone?.fee ?? 0,
        zoneName: data.deliveryZone?.name,
      }));
    } catch {
      setError("CEP não encontrado. Verifique a área de entrega.");
    } finally {
      setLoading(false);
    }
  }

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    try {
      const { data } = await axios.post("/api/cupons/validar", {
        code: couponInput.trim().toUpperCase(),
        subtotal: subtotal(),
      });
      setCoupon(data.code, data.discount, !!data.freeDelivery);
      setError("");
    } catch {
      setError("Cupom inválido ou expirado");
    }
  }

  async function submitOrder() {
    setLoading(true);
    setError("");
    try {
      // Uma única chamada: o servidor resolve cliente, endereço e pedido dentro da unidade
      const usingSaved = orderType === "DELIVERY" && isLoggedIn && !!selectedSavedAddressId && selectedSavedAddressId !== "new";

      const { data: order } = await axios.post("/api/checkout", {
        customer: isLoggedIn
          ? undefined
          : { name: customer.name, phone: customer.phone.replace(/\D/g, ""), email: customer.email || undefined },
        savedAddressId: usingSaved ? selectedSavedAddressId : undefined,
        address: orderType === "DELIVERY" && !usingSaved
          ? {
              cep: address.cep,
              street: address.street,
              number: address.number,
              complement: address.complement || undefined,
              neighborhood: address.neighborhood,
              city: address.city,
              state: address.state,
            }
          : undefined,
        deliveryZoneId: orderType === "DELIVERY" ? address.deliveryZoneId : undefined,
        type: orderType,
        paymentMethod,
        changeAmount: paymentMethod === "CASH" && changeAmount ? parseFloat(changeAmount) : undefined,
        invoiceDays: paymentMethod === "INVOICE" ? invoiceDays : undefined,
        couponCode: isReseller ? undefined : couponCode || undefined,
        items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity, notes: i.notes, combo: i.combo })), // combo: escolha dentro do combo (validada no servidor)
      });

      setOrderId(order.id);
      setOrderNumber(order.number);
      if (order.paymentLinkUrl) setPaymentLinkUrl(order.paymentLinkUrl);
      setStep("success");
      clear();
    } catch (err) {
      console.error(err);
      // Mensagens do servidor (estoque, cupom, zona…) são pensadas para o cliente
      const msg = axios.isAxiosError(err) && err.response?.status && err.response.status < 500 ? err.response.data?.error : null;
      setError(msg || "Erro ao finalizar pedido. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const showManualAddressForm = !isLoggedIn || savedAddresses.length === 0 || selectedSavedAddressId === "new";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 58, background: "#FBF6EC", overflowY: "auto", animation: "bgl-fade .22s ease", fontFamily: "'Poppins',sans-serif", color: "#4A3526" }}>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: "rgba(251,246,236,.94)", backdropFilter: "blur(10px)", borderBottom: "2px solid #F0E7D6" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={onClose}
              style={{ display: "flex", alignItems: "center", gap: 7, background: "#F2E8D6", border: "none", borderRadius: 12, padding: "9px 14px", color: "#4A3526", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              Voltar
            </button>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 22, color: "#4A3526" }}>Finalizar pedido</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              {(["customer", "address", "payment", "confirm"] as Step[]).map((s, i) => (
                <div key={s} style={{ height: 4, borderRadius: 999, transition: "all .2s", background: ["customer", "address", "payment", "confirm"].indexOf(step) >= i ? "#F26C21" : "#EBDDC8", width: s === step ? 24 : 12 }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 640, margin: "0 auto", width: "100%", padding: "24px 20px 80px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Step: Dados do cliente */}
          {step === "customer" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-orange-500" />
                </div>
                <h3 className="font-semibold text-zinc-900">Seus dados</h3>
              </div>

              {isLoggedIn && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                  <CheckCircle size={15} color="#22c55e" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "#166534" }}>
                    Logado como <strong>{session?.user?.name?.split(" ")[0]}</strong> — dados pré-preenchidos
                  </span>
                </div>
              )}

              <div>
                <label className="text-sm text-zinc-600 mb-1.5 block">Nome completo *</label>
                <Input
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-600 mb-1.5 block">Telefone (WhatsApp) *</label>
                <Input
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                  type="tel"
                  readOnly={isLoggedIn}
                  style={isLoggedIn ? { background: "#f5f0e8", color: "#a8a29e" } : {}}
                />
              </div>
              <div>
                <label className="text-sm text-zinc-600 mb-1.5 block">E-mail (opcional)</label>
                <Input
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  placeholder="seu@email.com"
                  type="email"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setOrderType("DELIVERY")}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                    orderType === "DELIVERY"
                      ? "border-orange-500 bg-orange-50 text-orange-700"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  🛵 Delivery
                </button>
                <button
                  onClick={() => setOrderType("PICKUP")}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                    orderType === "PICKUP"
                      ? "border-orange-500 bg-orange-50 text-orange-700"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  🏪 Retirada
                </button>
              </div>
            </div>
          )}

          {/* Step: Endereço */}
          {step === "address" && orderType === "DELIVERY" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-orange-500" />
                </div>
                <h3 className="font-semibold text-zinc-900">Endereço de entrega</h3>
              </div>

              {/* Saved addresses (logged-in only) */}
              {isLoggedIn && loadingAddresses && (
                <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                  <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "#F26C21" }} />
                </div>
              )}

              {isLoggedIn && !loadingAddresses && savedAddresses.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ fontSize: 13, color: "#78716c", fontWeight: 500 }}>Endereços salvos</p>

                  {savedAddresses.map((addr) => {
                    const selected = selectedSavedAddressId === addr.id;
                    return (
                      <button
                        key={addr.id}
                        onClick={() => selectSavedAddress(addr)}
                        style={{
                          width: "100%",
                          background: selected ? "#fff7ed" : "#fff",
                          border: `1.5px solid ${selected ? "#F26C21" : "#e8dcc8"}`,
                          borderRadius: 12,
                          padding: "12px 14px",
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: selected ? "#F26C21" : "#f5f0e8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {selected
                            ? <CheckCircle size={16} color="#fff" />
                            : <MapPin size={14} color="#a8a29e" />
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: selected ? "#F26C21" : "#1c1917" }}>{addr.label}</p>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#78716c" }}>
                            {addr.street}, {addr.number} — {addr.neighborhood}
                          </p>
                          {addr.deliveryZone && (
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#22c55e" }}>
                              ✓ Taxa: {formatCurrency(addr.deliveryZone.fee)}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  <button
                    onClick={() => {
                      setSelectedSavedAddressId("new");
                      setAddress({ cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "SP" });
                    }}
                    style={{
                      width: "100%",
                      background: selectedSavedAddressId === "new" ? "#fff7ed" : "transparent",
                      border: `1.5px dashed ${selectedSavedAddressId === "new" ? "#F26C21" : "#e8dcc8"}`,
                      borderRadius: 12,
                      padding: "10px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                      color: selectedSavedAddressId === "new" ? "#F26C21" : "#a8a29e",
                      fontWeight: 500,
                    }}
                  >
                    + Usar outro endereço
                  </button>
                </div>
              )}

              {/* Manual address form */}
              {showManualAddressForm && (
                <>
                  <div>
                    <label className="text-sm text-zinc-600 mb-1.5 block">CEP *</label>
                    <div className="flex gap-2">
                      <Input
                        value={address.cep}
                        onChange={(e) => setAddress({ ...address, cep: formatCep(e.target.value) })}
                        placeholder="00000-000"
                        maxLength={9}
                        className="flex-1"
                      />
                      <Button onClick={lookupCep} disabled={loading} variant="outline" className="shrink-0">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
                      </Button>
                    </div>
                    {address.zoneName && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ Entregamos em {address.zoneName} — Taxa: {formatCurrency(deliveryFee)}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-sm text-zinc-600 mb-1.5 block">Rua *</label>
                      <Input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="Rua..." />
                    </div>
                    <div>
                      <label className="text-sm text-zinc-600 mb-1.5 block">Número *</label>
                      <Input value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} placeholder="N°" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-zinc-600 mb-1.5 block">Complemento</label>
                    <Input value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} placeholder="Apto, bloco..." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-zinc-600 mb-1.5 block">Bairro *</label>
                      <Input value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} placeholder="Bairro" />
                    </div>
                    <div>
                      <label className="text-sm text-zinc-600 mb-1.5 block">Cidade *</label>
                      <Input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="Cidade" />
                    </div>
                  </div>
                </>
              )}

              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
          )}

          {/* Step: Pagamento */}
          {step === "payment" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-orange-500" />
                </div>
                <h3 className="font-semibold text-zinc-900">Pagamento</h3>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Pague agora</p>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.filter(m => m.online).map((m) => (
                    <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                      className={`py-3 px-3 rounded-xl border text-sm font-medium transition-all text-left flex items-center gap-2 ${paymentMethod === m.value ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>
                      <span>{m.icon}</span> {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide pt-1">Pague na entrega</p>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.filter(m => !m.online).map((m) => (
                    <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                      className={`py-3 px-3 rounded-xl border text-sm font-medium transition-all text-left flex items-center gap-2 ${paymentMethod === m.value ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>
                      <span>{m.icon}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {isReseller && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide pt-1">Faturar</p>
                  <button onClick={() => setPaymentMethod("INVOICE")}
                    className={`w-full py-3 px-3 rounded-xl border text-sm font-medium transition-all text-left flex items-center gap-2 ${paymentMethod === "INVOICE" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>
                    <span>🧾</span> Faturado — pagar depois
                  </button>
                  {paymentMethod === "INVOICE" && (
                    <div>
                      <label className="text-sm text-zinc-600 mb-1.5 block">Prazo para pagamento</label>
                      <div className="grid grid-cols-4 gap-2">
                        {RESELLER_INVOICE_DAYS.map((d) => (
                          <button key={d} onClick={() => setInvoiceDays(d)}
                            className={`py-2 rounded-xl border text-sm font-medium ${invoiceDays === d ? "border-orange-500 bg-orange-50 text-orange-700" : "border-zinc-200 text-zinc-600"}`}>
                            {d} dias
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-zinc-500 mt-1.5">O prazo conta a partir da data do pedido.</p>
                    </div>
                  )}
                </div>
              )}
              {paymentMethod === "CASH" && (
                <div>
                  <label className="text-sm text-zinc-600 mb-1.5 block">Troco para quanto?</label>
                  <Input
                    value={changeAmount}
                    onChange={(e) => setChangeAmount(e.target.value)}
                    placeholder="Ex: 50,00"
                    type="number"
                  />
                </div>
              )}

              {!isReseller && (
              <div className="border-t pt-4">
                <label className="text-sm text-zinc-600 mb-1.5 block">Cupom de desconto</label>
                <div className="flex gap-2">
                  <Input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="CÓDIGO"
                    className="uppercase"
                  />
                  <Button onClick={applyCoupon} variant="outline" className="shrink-0">
                    Aplicar
                  </Button>
                </div>
                {couponCode && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    ✓ Cupom <strong>{couponCode}</strong> aplicado — {freeDelivery ? "frete grátis!" : <>economize {formatCurrency(discount)}!</>}
                    <button onClick={clearCoupon} className="ml-1 text-red-400 hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </p>
                )}
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
              </div>
              )}
            </div>
          )}

          {/* Step: Confirmar */}
          {step === "confirm" && (
            <div className="space-y-4">
              <h3 className="font-semibold text-zinc-900 mb-4">Confirmar pedido</h3>

              <div className="bg-zinc-50 rounded-2xl divide-y divide-zinc-100">
                {items.map((item) => (
                  <div key={item.lineId ?? item.product.id} className="flex justify-between py-2.5 px-3 text-sm">
                    <span className="text-zinc-700">{item.quantity}x {item.product.name}{item.comboSummary && <span className="block text-xs text-zinc-400">{item.comboSummary}</span>}</span>
                    <span className="font-medium text-zinc-900">{formatCurrency(item.product.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal())}</span>
                </div>
                {orderType === "DELIVERY" && (
                  <div className="flex justify-between text-zinc-600">
                    <span>Entrega</span>
                    <span>{deliveryFee > 0 && !freeDelivery ? formatCurrency(deliveryFee) : "Grátis"}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Desconto ({couponCode})</span>
                    <span>-{formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>Total</span>
                  <span className="text-orange-600">{formatCurrency(finalTotal)}</span>
                </div>
              </div>

              <div className="bg-zinc-50 rounded-xl p-3 space-y-1 text-sm text-zinc-600">
                <p><strong>Cliente:</strong> {customer.name}</p>
                {orderType === "DELIVERY" && address.street && (
                  <p><strong>Entrega:</strong> {address.street}, {address.number} — {address.neighborhood}, {address.city}</p>
                )}
                {orderType === "PICKUP" && <p><strong>Modalidade:</strong> Retirada na loja</p>}
                <p><strong>Pagamento:</strong> {PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label}</p>
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
            </div>
          )}

          {/* Step: Sucesso */}
          {step === "success" && (
            <div className="flex flex-col items-center text-center py-8 space-y-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900">Pedido realizado!</h3>
                <p className="text-zinc-500 mt-1">Pedido <strong>#{orderNumber}</strong> confirmado</p>
              </div>
              {paymentLinkUrl ? (
                <div style={{ width: "100%", background: "#fff7ed", border: "2px solid #F26C21", borderRadius: 16, padding: 16, textAlign: "center" }}>
                  <p style={{ fontWeight: 700, fontSize: 15, color: "#4A3526", marginBottom: 8 }}>💳 Finalize o pagamento</p>
                  <p style={{ fontSize: 13, color: "#78716c", marginBottom: 14 }}>Clique no botão abaixo para pagar com PIX ou cartão:</p>
                  <a
                    href={paymentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-block", background: "#F26C21", color: "#fff", borderRadius: 12, padding: "12px 24px", fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 15, textDecoration: "none", boxShadow: "0 4px 0 #C9530C" }}
                  >
                    Pagar agora →
                  </a>
                </div>
              ) : (
                <div className="bg-zinc-50 rounded-2xl p-4 w-full text-sm text-zinc-600 space-y-1">
                  <p>🍽️ Estamos preparando seu pedido</p>
                  {orderType === "DELIVERY" && <p>🛵 O entregador vai chegar em breve</p>}
                  <p>💬 Você receberá atualizações pelo WhatsApp</p>
                </div>
              )}
              {isLoggedIn && (
                <p style={{ fontSize: 13, color: "#78716c" }}>
                  📋 Acompanhe em{" "}
                  <a href="/minha-conta/pedidos" style={{ color: "#F26C21", fontWeight: 600, textDecoration: "none" }}>
                    Meus Pedidos
                  </a>
                </p>
              )}
              <div className="text-4xl">🎉</div>
            </div>
          )}
        </div>

        {/* Footer com botões de navegação */}
        {step !== "success" && (
          <div style={{ paddingTop: 24, display: "flex", gap: 12 }}>
            {step !== "customer" && (
              <Button
                variant="outline"
                onClick={() => {
                  const steps: Step[] = ["customer", "address", "payment", "confirm"];
                  const idx = steps.indexOf(step);
                  setStep(steps[Math.max(0, idx - 1)]);
                }}
                className="flex-1"
                style={{ borderColor: "#EBDDC8", color: "#4A3526", borderRadius: 14, height: 50 }}
              >
                Voltar
              </Button>
            )}
            <button
              onClick={() => {
                setError("");
                if (step === "customer") {
                  if (!customer.name.trim() || !customer.phone.trim()) { setError("Nome e telefone são obrigatórios"); return; }
                  setStep(orderType === "DELIVERY" ? "address" : "payment");
                } else if (step === "address") {
                  if (!showManualAddressForm && selectedSavedAddressId && selectedSavedAddressId !== "new") {
                    // Saved address selected — validate zone
                    if (!address.deliveryZoneId) { setError("Este endereço não tem zona de entrega configurada"); return; }
                    setStep("payment");
                  } else {
                    if (!address.street || !address.number || !address.neighborhood) { setError("Preencha o endereço completo"); return; }
                    setStep("payment");
                  }
                } else if (step === "payment") {
                  setStep("confirm");
                } else if (step === "confirm") {
                  submitOrder();
                }
              }}
              disabled={loading}
              style={{ flex: 1, height: 50, background: "#F26C21", color: "#fff", border: "none", borderRadius: 14, fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 5px 0 #C9530C", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? .7 : 1 }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {step === "confirm" ? "Confirmar pedido" : "Continuar"}
            </button>
          </div>
        )}
        {step === "success" && (
          <div style={{ paddingTop: 24 }}>
            <button
              onClick={onClose}
              style={{ width: "100%", height: 50, background: "#F26C21", color: "#fff", border: "none", borderRadius: 14, fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 16, cursor: "pointer", boxShadow: "0 5px 0 #C9530C" }}
            >
              Voltar ao cardápio
            </button>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
