// Sonda SOMENTE LEITURA da API Open Delivery do Goomer.
// Uso: npx tsx --env-file=.env scripts/goomer-od-probe.ts
// Requer GOOMER_OD_CLIENT_ID e GOOMER_OD_CLIENT_SECRET no .env.
// NÃO confirma eventos (acknowledgment) e NÃO chama confirm/dispatch: nada muda no Goomer.
// Salva as respostas brutas em /root/goomer-probe/ para análise.
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.GOOMER_OD_BASE_URL || "https://partner-api.goomer.app/opendelivery";
const id = process.env.GOOMER_OD_CLIENT_ID;
const secret = process.env.GOOMER_OD_CLIENT_SECRET;
if (!id || !secret) { console.error("Defina GOOMER_OD_CLIENT_ID e GOOMER_OD_CLIENT_SECRET no .env"); process.exit(1); }

const OUT = "/root/goomer-probe";
mkdirSync(OUT, { recursive: true, mode: 0o700 }); // pedidos têm dados pessoais
const salvar = (nome: string, dados: unknown) => writeFileSync(`${OUT}/${nome}`, typeof dados === "string" ? dados : JSON.stringify(dados, null, 2));

async function chamar(metodo: string, caminho: string, token?: string, body?: string) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
      : { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const texto = await r.text();
  let json: unknown = texto;
  try { json = JSON.parse(texto); } catch { /* resposta não-JSON */ }
  console.log(`${metodo} ${caminho} -> ${r.status}`);
  return { status: r.status, json };
}

async function main() {
  const auth = await chamar("POST", "/oauth/token", undefined,
    new URLSearchParams({ grant_type: "client_credentials", client_id: id!, client_secret: secret! }).toString());
  const token = (auth.json as { access_token?: string })?.access_token;
  if (!token) { console.error("Sem token. Resposta:", auth.json); process.exit(1); }
  console.log("Token obtido (não exibido).");

  const ev = await chamar("GET", "/v1/events:polling", token);
  salvar("eventos.json", ev.json);
  const eventos = Array.isArray(ev.json) ? ev.json as Array<Record<string, unknown>> : [];
  console.log(`${eventos.length} evento(s). Tipos:`, [...new Set(eventos.map((e) => e.eventType))]);
  for (const e of eventos.slice(0, 10)) console.log(" ", e.eventType, e.orderId, e.createdAt);

  const pedidos = [...new Set(eventos.map((e) => String(e.orderId)).filter(Boolean))].slice(0, 3);
  for (const pid of pedidos) {
    const p = await chamar("GET", `/v1/orders/${pid}`, token);
    salvar(`pedido-${pid}.json`, p.json);
  }
  console.log(`Respostas salvas em ${OUT}/ (nenhum evento foi confirmado).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
