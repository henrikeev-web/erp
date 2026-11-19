// Teste da conversão Open Delivery → ERP (puro, sem banco nem rede).
// Uso: npx tsx scripts/test-goomer-od.ts [pedido.json]   (sem arquivo usa um pedido sintético)
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { mapOrder, mapPayment, phoneDigits, type OdOrder } from "../src/lib/goomer-od-map";

const brl = (value: number) => ({ value, currency: "BRL" });
const sintetico: OdOrder = {
  id: "uuid-1", type: "DELIVERY", displayId: "#0007", createdAt: "2026-11-19T12:00:00.000Z",
  merchant: { id: "20863" },
  items: [
    { id: "1", name: "Pê-efinho", quantity: 2, unitPrice: brl(16.9), totalPrice: brl(33.8) },
    { id: "2", name: "Caldo", quantity: 1, unitPrice: brl(20), totalPrice: brl(23), options: [{ name: "Extra", quantity: 1 }], specialInstructions: "sem sal" },
  ],
  total: { itemsPrice: brl(56.8), otherFees: brl(8), discount: brl(5), orderAmount: brl(59.8) },
  otherFees: [{ name: "Entrega", type: "DELIVERY_FEE", price: brl(8) }],
  customer: { name: "Fulana", phone: { number: "+55 (17) 99999-0000" } },
  delivery: { deliveryAddress: { street: "Rua A", number: "10", district: "Centro", city: "SJRP", state: "sp", postalCode: "15015-000" } },
  payments: { prepaid: 0, pending: 59.8, methods: [{ type: "PENDING", method: "CASH", value: 59.8, changeFor: 100 }] },
};

const m = mapOrder(sintetico);
assert.equal(m.phone, "17999990000");
assert.equal(m.type, "DELIVERY");
assert.equal(m.subtotal, 56.8);
assert.equal(m.deliveryFee, 8);
assert.equal(m.discount, 5);
assert.equal(m.total, 59.8);
assert.equal(m.items[1].price, 23);
assert.equal(m.items[1].notes, "+ Extra · sem sal");
assert.equal(m.address?.cep, "15015000");
assert.equal(m.address?.state, "SP");
assert.equal(m.payment.method, "CASH");
assert.equal(m.payment.changeFor, 100);
assert.match(m.notes, /Goomer #0007 \(tempo real\) · Troco para R\$ 100,00/);

assert.equal(mapPayment({ ...sintetico, payments: { prepaid: 10, pending: 0, methods: [{ type: "PREPAID", method: "PIX" }] } }).method, "ONLINE_PIX");
assert.equal(mapPayment({ ...sintetico, payments: { methods: [{ type: "PREPAID", method: "CREDIT" }] } }).method, "ONLINE_CREDIT");
assert.equal(mapPayment({ ...sintetico, payments: { methods: [{ type: "PENDING", method: "DEBIT" }] } }).method, "DEBIT_CARD");
assert.equal(mapOrder({ ...sintetico, type: "TAKEOUT" }).address, null);
assert.equal(phoneDigits("5517999990000"), "17999990000");
assert.throws(() => mapOrder({ ...sintetico, createdAt: "x" }));
console.log("sintético: ok");

const arquivo = process.argv[2];
if (arquivo) {
  const r = mapOrder(JSON.parse(readFileSync(arquivo, "utf8")));
  const soma = Math.round((r.subtotal + r.deliveryFee - r.discount) * 100) / 100;
  console.log(`real: ${r.items.length} itens, subtotal ${r.subtotal}, frete ${r.deliveryFee}, desconto ${r.discount}, total ${r.total} (conta ${soma}), pagamento ${r.payment.method}, endereço ${r.address ? "sim" : "não"}, telefone ${r.phone.length} dígitos`);
  assert.equal(soma, r.total, "subtotal + frete - desconto deve bater com o total");
  assert.equal(Math.round(r.items.reduce((s, i) => s + i.total, 0) * 100) / 100, r.subtotal, "soma dos itens deve bater com o subtotal");
  console.log("real: ok");
}
