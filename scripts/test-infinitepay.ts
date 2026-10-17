import { buildCheckoutItems, extractLink, isPaymentSufficient, normalizeHandle, toCents } from "../src/lib/infinitepay";
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); };
const sum = (l: { price: number; quantity: number }[]) => l.reduce((s, i) => s + i.price * i.quantity, 0);

// handle
t("handle com $", normalizeHandle(" $banguelas "), "banguelas");
t("handle inválida (espaço)", normalizeHandle("ban guelas"), null);
t("handle vazia", normalizeHandle(""), null);
t("handle não-string", normalizeHandle(42), null);

// itens fecham com o total
const base = { number: 7, items: [{ name: "Papinha", price: 12.9, quantity: 3 }, { name: "Caldo", price: 9.9, quantity: 1 }] };
const o1 = { ...base, deliveryFee: 8, discount: 0, total: 12.9 * 3 + 9.9 + 8 };
const i1 = buildCheckoutItems(o1);
t("sem desconto: linhas + frete", i1.length, 3);
t("sem desconto: soma = total", sum(i1), toCents(o1.total));
const o2 = { ...base, deliveryFee: 8, discount: 5, total: 12.9 * 3 + 9.9 + 8 - 5 };
const i2 = buildCheckoutItems(o2);
t("com desconto: item único", i2.length, 1);
t("com desconto: soma = total", sum(i2), toCents(o2.total));
const o3 = { ...base, deliveryFee: 0, discount: 0, total: 12.9 * 3 + 9.9 };
t("retirada: sem linha de frete", buildCheckoutItems(o3).some((i) => i.description === "Taxa de entrega"), false);
t("retirada: soma = total", sum(buildCheckoutItems(o3)), toCents(o3.total));
const o4 = { ...base, deliveryFee: 0, discount: 0, total: 50 }; // total divergente das linhas → item único
t("divergência: cai no item único", sum(buildCheckoutItems(o4)), 5000);

// resposta de /links
t("url direta", extractLink({ url: "https://checkout.infinitepay.io/x", slug: "abc" }), { url: "https://checkout.infinitepay.io/x", slug: "abc" });
t("url aninhada", extractLink({ data: { checkout_url: "https://c.io/y", invoice_slug: "s" } }), { url: "https://c.io/y", slug: "s" });
let threw = false; try { extractLink({ foo: 1 }); } catch { threw = true; }
t("sem url → erro", threw, true);
threw = false; try { extractLink({ url: "javascript:alert(1)" }); } catch { threw = true; }
t("url não-https recusada", threw, true);

// prova de pagamento
const chk = (paid: boolean, amount: number | null, paidAmount: number | null) => ({ paid, amountCents: amount, paidAmountCents: paidAmount, installments: null, captureMethod: null });
t("pago exato", isPaymentSufficient(chk(true, 5000, 5000), 50), true);
t("pago com juros (parcelado)", isPaymentSufficient(chk(true, 5000, 5230), 50), true);
t("pago a menos", isPaymentSufficient(chk(true, 5000, 4999), 50), false);
t("não pago", isPaymentSufficient(chk(false, 5000, 5000), 50), false);
t("sem valor informado", isPaymentSufficient(chk(true, null, null), 50), false);
t("só amount (sem paid_amount)", isPaymentSufficient(chk(true, 5000, null), 50), true);
t("arredondamento 0,1+0,2", toCents(0.1 + 0.2), 30);
console.log(bad ? `\n${bad} FALHA(S)` : "\ntudo ok");
process.exit(bad ? 1 : 0);
