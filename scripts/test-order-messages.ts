// Regras puras da mensagem automática (src/lib/order-messages.ts). Rodar: npx tsx scripts/test-order-messages.ts
import assert from "node:assert/strict";
import { firstName, pickTemplate, productsValue, renderMessage, whatsappNumber, DEFAULT_ABOVE, DEFAULT_BELOW } from "../src/lib/order-messages";

const cfg = { threshold: 120, messageBelow: "B", messageAbove: "A" };
// valor = total − frete
assert.equal(productsValue({ total: 130, deliveryFee: 15 }), 115);
assert.equal(productsValue({ total: 135, deliveryFee: 15 }), 120);
assert.equal(productsValue({ total: 50 }), 50);
assert.equal(productsValue({ total: 0.1 + 0.2, deliveryFee: 0 }), 0.3);
assert.equal(pickTemplate(cfg, 119.99).kind, "below");
assert.equal(pickTemplate(cfg, 120).kind, "above");
assert.equal(pickTemplate(cfg, 300).text, "A");
assert.equal(pickTemplate(cfg, productsValue({ total: 130, deliveryFee: 15 })).kind, "below"); // frete não conta

// nome
assert.equal(firstName("MARIA da silva"), "Maria");
assert.equal(firstName("  joão  "), "João");
assert.equal(firstName(""), "");
assert.equal(firstName("123"), "");
assert.equal(firstName("Cliente Goomer"), "");
assert.equal(renderMessage("Olá, [nome]! 💛", "Cliente Goomer"), "Olá! 💛");
assert.equal(renderMessage("Olá, [nome]! 💛", "ana paula"), "Olá, Ana! 💛");
assert.equal(renderMessage("Olá, [nome]! 💛", ""), "Olá! 💛");
assert.equal(renderMessage("Oi [Nome], tudo bem?", null), "Oi, tudo bem?");
assert.ok(renderMessage(DEFAULT_BELOW, "Carla").startsWith("Olá, Carla! 💛"));
assert.ok(DEFAULT_ABOVE.includes("passou de R$ 120,00"));

// telefone
assert.equal(whatsappNumber("17999998888"), "5517999998888");
assert.equal(whatsappNumber("(17) 99999-8888"), "5517999998888");
assert.equal(whatsappNumber("+55 17 99999-8888"), "5517999998888");
assert.equal(whatsappNumber("017999998888"), "5517999998888");
assert.equal(whatsappNumber("1733334444"), "551733334444");
assert.equal(whatsappNumber("goomer:abc"), null);
assert.equal(whatsappNumber("999998888"), null);
assert.equal(whatsappNumber(""), null);
console.log("test-order-messages: OK");
