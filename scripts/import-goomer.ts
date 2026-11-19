/**
 * Importa o histórico do Goomer (goomer-export/) para o ERP.
 *
 *   npx tsx scripts/import-goomer.ts <catalogo.txt>                         # simulação: confere totais, não grava
 *   npx tsx scripts/import-goomer.ts <catalogo.txt> --sql <pasta> [--mes AAAA-MM]
 *                                                                           # gera um .sql por mês (transação única)
 *   npx tsx scripts/import-goomer.ts <catalogo.txt> --sql <pasta> --arquivo <pedidos-AAAA-MM.json> --de <ISO> --ate <ISO>
 *                                                                           # LACUNA: só pedidos com de <= createdAt < ate
 *
 * catalogo.txt = saída de: select id, name from "Product" (id|nome por linha).
 *
 * Regras:
 * - Idempotente: ids determinísticos + ON CONFLICT DO NOTHING; rodar de novo não duplica.
 * - Pedido importado: source='goomer', externalId=id do Goomer, historico=true e número NEGATIVO
 *   (ordem cronológica, -1 é o mais antigo); a tela mostra "0.N" (ver orderNo em lib/utils).
 * - Cliente por telefone (só dígitos, sem 55): se já existir no ERP é reaproveitado e não é alterado.
 *   Clientes importados nascem sem nenhuma notificação ligada.
 * - Item sem produto equivalente no catálogo vai para o produto inativo "Legado Goomer";
 *   nome e preço originais ficam no OrderItem.
 * - Nada de estoque, fidelidade, impressão, SSE ou WhatsApp: só INSERTs.
 * - Modo lacuna (--arquivo): o número continua a partir do menor número já existente (min - 1, fora da
 *   ordem cronológica) e o pedido é pulado se já houver pedido do Goomer em tempo real (Open Delivery,
 *   id diferente) com o mesmo telefone e total, criado até 2 min de diferença.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "goomer-export");
const LEGADO_ID = "gm_legado";

const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[*"'“”-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Remove marcas de promoção/quantidade que o Goomer colocava no nome do produto.
const semMarcas = (s: string) =>
  s
    .replace(/^(promocao|promo)!*\s+/, "")
    .replace(/^(apenas\s+)?\d+\s+(unidades|unids?)\s+/, "")
    .replace(/\s+promo!*$/, "")
    .trim();

type Item = { id: string; name: string; quantity: number; price: number; comment: string };
type Pedido = {
  id: string;
  idOrdersResource: number | string;
  ordersCount: number;
  status: string;
  createdAt: string;
  clientName: string;
  clientPhone: string;
  addressCity: string;
  addressState: string;
  addressStreet: string;
  addressNumber: string;
  addressPostalcode: string;
  addressComplement: string;
  addressNeighborhood: string;
  deliveryWay: string;
  paymentType: string;
  paymentCategory: string;
  paymentFlag: string;
  paymentMoneyChange: number;
  storeCouponCode: string | null;
  valueSubtotal: number;
  valueDeliveryFee: number;
  valueTotal: number;
  items: Item[];
};

const PAGAMENTO: Record<string, string> = {
  mm_credit: "CREDIT_CARD",
  mm_debit: "DEBIT_CARD",
  mm_cash: "CASH",
  mm_pix: "PIX",
  tuna_checkout: "ONLINE_CREDIT",
  mm_payment_tuna_pix_checkout_enabled: "ONLINE_PIX",
  mm_feature_apple_pay_payment_method_enabled: "ONLINE_CREDIT",
  mm_payment_tuna_nupay_checkout_enabled: "ONLINE_CREDIT",
};

const q = (v: unknown) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/\0/g, "").replace(/'/g, "''")}'`);
const n = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "0");
const ts = (ms: number | string) => `'${new Date(Number(ms)).toISOString().replace("T", " ").replace("Z", "")}'`;
const dig = (p: string) => (p ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
const h = (s: string) => crypto.createHash("md5").update(s).digest("hex").slice(0, 16);

function carregarCatalogo(arquivo: string) {
  const mapa = new Map<string, string>();
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const [id, nome] = linha.split("|");
    if (id && nome) mapa.set(norm(nome), id);
  }
  return mapa;
}

function carregarPedidos() {
  const porMes = new Map<string, Pedido[]>();
  for (const arq of fs.readdirSync(path.join(DIR, "pedidos")).sort()) {
    const mes = arq.match(/(\d{4}-\d{2})/)![1];
    porMes.set(mes, (JSON.parse(fs.readFileSync(path.join(DIR, "pedidos", arq), "utf8")) as { orders: Pedido[] }).orders);
  }
  return porMes;
}

function carregarConferencia() {
  const conf = new Map<string, { pedidos: number; cancelados: number; fat: number }>();
  for (const l of fs.readFileSync(path.join(DIR, "conferencia-mensal.csv"), "utf8").split("\n").slice(1)) {
    const c = l.replace(/^﻿/, "").split(";");
    if (c.length < 4 || !c[0]) continue;
    conf.set(c[0], { pedidos: Number(c[1]), cancelados: Number(c[2]), fat: Number(c[3].replace(",", ".")) });
  }
  return conf;
}

// Transações online que terminaram em estorno/chargeback, por idOrdersResource.
function carregarEstornos() {
  const mapa = new Map<string, string>();
  const dir = path.join(DIR, "transacoes");
  if (!fs.existsSync(dir)) return mapa;
  for (const arq of fs.readdirSync(dir)) {
    const { transactions } = JSON.parse(fs.readFileSync(path.join(dir, arq), "utf8")) as {
      transactions: { partnerUniqueId: string; paymentStatus: string; paymentDateTime: string }[];
    };
    for (const t of transactions) if (["Refunded", "Chargeback"].includes(t.paymentStatus)) mapa.set(String(t.partnerUniqueId), t.paymentDateTime);
  }
  return mapa;
}

function simular(catalogo: Map<string, string>) {
  const porMes = carregarPedidos();
  const conf = carregarConferencia();
  const telefones = new Set<string>();
  let casados = 0;
  let legado = 0;
  let divergencias = 0;
  for (const [mes, pedidos] of porMes) {
    const m = { pedidos: pedidos.length, cancelados: 0, fat: 0 };
    for (const p of pedidos) {
      if (p.status === "canceled") m.cancelados++;
      else m.fat += p.valueTotal;
      telefones.add(p.clientPhone);
      for (const i of p.items) (catalogo.has(norm(i.name)) || catalogo.has(semMarcas(norm(i.name))) ? casados++ : legado++);
    }
    const c = conf.get(mes);
    if (!(c && c.pedidos === m.pedidos && c.cancelados === m.cancelados && Math.abs(c.fat - m.fat) < 0.05)) {
      divergencias++;
      console.log(`DIVERGE ${mes}: ${JSON.stringify(m)} x ${JSON.stringify(c)}`);
    }
  }
  const total = [...porMes.values()].reduce((s, l) => s + l.length, 0);
  console.log(`${porMes.size} meses, ${total} pedidos, ${telefones.size} telefones distintos`);
  console.log(`Itens: ${casados} com produto do catálogo, ${legado} no legado`);
  console.log(divergencias === 0 ? "Conferência mensal: tudo bate." : `Conferência mensal: ${divergencias} mês(es) divergente(s).`);
}

type Lacuna = { arquivo: string; de: number; ate: number };

function carregarLacuna(l: Lacuna) {
  const d = JSON.parse(fs.readFileSync(l.arquivo, "utf8")) as { month: string; orders: Pedido[] };
  const sel = d.orders
    .filter((p) => Number(p.createdAt) >= l.de && Number(p.createdAt) < l.ate)
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt) || a.id.localeCompare(b.id)); // números em ordem cronológica
  console.log(`${d.orders.length} pedidos no arquivo, ${sel.length} na janela ${new Date(l.de).toISOString()} → ${new Date(l.ate).toISOString()}`);
  return new Map<string, Pedido[]>([[`${d.month}-lacuna`, sel]]);
}

function gerarSql(catalogo: Map<string, string>, pasta: string, soMes?: string, lacuna?: Lacuna) {
  const porMes = lacuna ? carregarLacuna(lacuna) : carregarPedidos();
  const estornos = carregarEstornos();
  fs.mkdirSync(pasta, { recursive: true });

  // Número negativo por ordem cronológica em TODO o histórico (estável entre execuções).
  const todos = [...porMes.values()].flat().sort((a, b) => Number(a.createdAt) - Number(b.createdAt) || a.id.localeCompare(b.id));
  const numero = new Map<string, number>(todos.map((p, i) => [p.id, -(i + 1)]));

  // Dados do cliente vindos de clientes.json (e-mail, primeiro/último pedido).
  const extra = new Map<string, { id: number; email: string | null; first: string; last: string }>();
  for (const c of (JSON.parse(fs.readFileSync(path.join(DIR, "clientes.json"), "utf8")) as { customers: any[] }).customers)
    extra.set(dig(c.phone_number), { id: c.id, email: c.email, first: c.first_order_at, last: c.last_order_at });

  // Cliente mais recente (nome) e último pedido por telefone, sobre todo o histórico.
  const ultimoPorFone = new Map<string, Pedido>();
  for (const p of todos) ultimoPorFone.set(dig(p.clientPhone), p);
  const primeiroPorFone = new Map<string, Pedido>();
  for (const p of [...todos].reverse()) primeiroPorFone.set(dig(p.clientPhone), p);
  const ultimoEndereco = new Map<string, string>();
  const chaveEnd = (p: Pedido) => h([dig(p.clientPhone), p.addressPostalcode, p.addressStreet, p.addressNumber, p.addressComplement].join("|"));
  for (const p of todos) if (p.deliveryWay === "delivery" && p.addressStreet) ultimoEndereco.set(dig(p.clientPhone), chaveEnd(p));

  for (const [mes, pedidos] of porMes) {
    if (soMes && mes !== soMes) continue;
    const L: string[] = ["\\set ON_ERROR_STOP on", "BEGIN;", `CREATE TEMP TABLE _g ON COMMIT DROP AS SELECT id AS unit_id, "brandId" AS brand_id FROM "Unit" WHERE slug='matriz';`];
    L.push(
      `INSERT INTO "Product" (id,"brandId","unitId",name,description,price,active,frozen,"updatedAt") SELECT '${LEGADO_ID}',brand_id,unit_id,'Legado Goomer','Itens de pedidos importados do Goomer sem equivalente no cardápio atual',0,false,false,now() FROM _g ON CONFLICT DO NOTHING;`,
    );

    const clientes = new Set<string>();
    const enderecos = new Set<string>();
    for (const p of pedidos) {
      const fone = dig(p.clientPhone);
      if (!clientes.has(fone)) {
        clientes.add(fone);
        const u = ultimoPorFone.get(fone)!;
        const x = extra.get(fone);
        const criado = x?.first ? `'${x.first.replace("T", " ").replace("Z", "")}'` : ts(primeiroPorFone.get(fone)!.createdAt);
        const ultimo = x?.last ? `'${x.last.replace("T", " ").replace("Z", "")}'` : ts(u.createdAt);
        L.push(
          `INSERT INTO "Customer" (id,"brandId","unitId",name,email,phone,active,type,source,"externalId","createdAt","updatedAt","lastOrderAt","notifWhatsapp","notifEmail","notifPromos","notifReorder") SELECT 'gmc${fone}',brand_id,unit_id,${q(u.clientName || "Cliente Goomer")},${q(x?.email)},'${fone}',true,'RETAIL','goomer',${q(x ? String(x.id) : fone)},${criado},now(),${ultimo},false,false,false,false FROM _g ON CONFLICT DO NOTHING;`,
        );
      }
      if (p.deliveryWay === "delivery" && p.addressStreet && p.addressPostalcode) {
        const k = chaveEnd(p);
        if (!enderecos.has(k)) {
          enderecos.add(k);
          L.push(
            `INSERT INTO "CustomerAddress" (id,"customerId",label,cep,street,number,complement,neighborhood,city,state,"isDefault") SELECT 'gma${k}',c.id,'Casa',${q(p.addressPostalcode.replace(/\D/g, ""))},${q(p.addressStreet)},${q(p.addressNumber || "S/N")},${q(p.addressComplement)},${q(p.addressNeighborhood || "-")},${q(p.addressCity || "-")},${q(p.addressState || "SP")},${ultimoEndereco.get(fone) === k} FROM "Customer" c, _g WHERE c."unitId"=_g.unit_id AND c.phone='${fone}' ON CONFLICT DO NOTHING;`,
          );
        }
      }
    }

    for (const p of pedidos) {
      const fone = dig(p.clientPhone);
      const cancelado = p.status === "canceled";
      const online = p.paymentType === "paid_on_app";
      const metodo = PAGAMENTO[p.paymentCategory] ?? (online ? "ONLINE_CREDIT" : "CASH");
      const desconto = Math.max(0, Math.round((p.valueSubtotal + p.valueDeliveryFee - p.valueTotal) * 100) / 100);
      const quando = ts(p.createdAt);
      const addr = p.deliveryWay === "delivery" && p.addressStreet && p.addressPostalcode ? `'gma${chaveEnd(p)}'` : "NULL";
      const nota = `Importado do Goomer (nº ${p.ordersCount} do dia)${p.status === "accepted" ? " · status no Goomer: aceito" : ""}`;
      const estorno = estornos.get(String(p.idOrdersResource));
      const pagStatus = cancelado ? "CANCELLED" : estorno ? "REFUNDED" : "PAID";
      // Lacuna: número = menor existente - 1; não grava se o pedido já entrou em tempo real (outro id).
      const numExpr = lacuna ? `(SELECT LEAST(COALESCE(min(number),0),0)-1 FROM "Order" WHERE "unitId"=_g.unit_id)` : String(numero.get(p.id));
      const guarda = lacuna
        ? ` WHERE NOT EXISTS (SELECT 1 FROM "Order" o JOIN "Customer" c ON c.id=o."customerId" WHERE o."unitId"=_g.unit_id AND o.source='goomer' AND o.historico=false AND c.phone='${fone}' AND abs(o.total-${n(p.valueTotal)})<0.01 AND o."createdAt" BETWEEN ${quando}::timestamp - interval '2 minutes' AND ${quando}::timestamp + interval '2 minutes')`
        : "";
      const seGravou = lacuna ? ` WHERE EXISTS (SELECT 1 FROM "Order" WHERE id='gmo${p.id}')` : "";

      L.push(
        `INSERT INTO "Order" (id,number,"brandId","unitId","customerId","addressId",type,status,notes,subtotal,"deliveryFee",discount,"discountNote","couponCode",total,"confirmedAt","deliveredAt","cancelledAt","createdAt","updatedAt",source,"externalId",historico) SELECT 'gmo${p.id}',${numExpr},brand_id,unit_id,(SELECT id FROM "Customer" WHERE "unitId"=_g.unit_id AND phone='${fone}'),${addr},'${p.deliveryWay === "delivery" ? "DELIVERY" : "PICKUP"}','${cancelado ? "CANCELLED" : "DELIVERED"}',${q(nota)},${n(p.valueSubtotal)},${n(p.valueDeliveryFee)},${n(desconto)},${q(p.storeCouponCode ? `Cupom ${p.storeCouponCode}` : null)},${q(p.storeCouponCode)},${n(p.valueTotal)},${cancelado ? "NULL" : quando},${cancelado ? "NULL" : quando},${cancelado ? quando : "NULL"},${quando},${quando},'goomer','${p.id}',true FROM _g${guarda} ON CONFLICT DO NOTHING;`,
      );

      for (const i of p.items) {
        const nm = norm(i.name);
        const prod = catalogo.get(nm) ?? catalogo.get(semMarcas(nm)) ?? LEGADO_ID;
        L.push(
          `INSERT INTO "OrderItem" (id,"orderId","productId",name,price,quantity,total,notes) SELECT 'gmi${i.id}','gmo${p.id}','${prod}',${q(i.name)},${n(i.price)},${i.quantity},${n(i.price * i.quantity)},${q(i.comment)}${seGravou} ON CONFLICT DO NOTHING;`,
        );
      }

      const dados = JSON.stringify({ origem: "goomer", paymentType: p.paymentType, paymentCategory: p.paymentCategory, paymentFlag: p.paymentFlag });
      L.push(
        `INSERT INTO "Payment" (id,"orderId",method,status,amount,"gatewayId","gatewayData","paidAt","refundedAt","changeAmount","createdAt","updatedAt") SELECT 'gmp${p.id}','gmo${p.id}','${metodo}','${pagStatus}',${n(p.valueTotal)},${online ? q(String(p.idOrdersResource)) : "NULL"},${q(dados)}::jsonb,${pagStatus === "CANCELLED" ? "NULL" : quando},${estorno ? `'${estorno.replace("T", " ")}'` : "NULL"},${p.paymentMoneyChange ? n(p.paymentMoneyChange) : "NULL"},${quando},${quando}${seGravou} ON CONFLICT DO NOTHING;`,
      );
    }
    L.push("COMMIT;");
    fs.writeFileSync(path.join(pasta, `goomer-${mes}.sql`), L.join("\n") + "\n");
    console.log(`goomer-${mes}.sql: ${pedidos.length} pedidos`);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (!args[0]) throw new Error("Informe o arquivo de catálogo (id|nome por linha).");
  const catalogo = carregarCatalogo(args[0]);
  const i = args.indexOf("--sql");
  if (i < 0) return simular(catalogo);
  const mes = args.indexOf("--mes");
  const arq = args.indexOf("--arquivo");
  let lacuna: Lacuna | undefined;
  if (arq >= 0) {
    const de = Date.parse(args[args.indexOf("--de") + 1]);
    const ate = Date.parse(args[args.indexOf("--ate") + 1]);
    if (args.indexOf("--de") < 0 || args.indexOf("--ate") < 0 || !Number.isFinite(de) || !Number.isFinite(ate) || de >= ate)
      throw new Error("Modo lacuna exige --de e --ate (datas ISO, de < ate).");
    lacuna = { arquivo: args[arq + 1], de, ate };
  }
  gerarSql(catalogo, args[i + 1], mes >= 0 ? args[mes + 1] : undefined, lacuna);
}

main();
