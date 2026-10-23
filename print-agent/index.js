/**
 * Banguelas Print Agent
 *
 * Roda no computador da loja. Escuta o stream SSE do ERP e imprime o pedido
 * numa impressora térmica ESC/POS.
 *
 * Quando imprime:
 *   - order_confirmed (pagamento aprovado ou pedido confirmado pelo painel): sempre
 *   - order_new: só se o pagamento NÃO for online (dinheiro, maquininha, PIX na entrega,
 *     faturado). Pedido com pagamento online espera o order_confirmed.
 *   Cada pedido sai uma única vez (controle em printed.json). Se a impressora falhar
 *   (desligada, sem papel), o pedido fica em pending.json e é tentado de novo.
 *
 * Instalação: veja print-agent/README.md
 *
 * PRINTER_INTERFACE:
 *   share:NomeDoCompartilhamento   Windows — impressora compartilhada (copy /b \\localhost\Nome)
 *   tcp://192.168.1.100:9100       impressora de rede
 *   usb://0x04b8:0x0202            USB direto (Linux/macOS; no Windows prefira share:)
 *   /dev/ttyUSB0 | //./COM3        serial
 */

require("dotenv").config();
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { execFile } = require("child_process");
const EventSource = require("eventsource");
const { ThermalPrinter, PrinterTypes, CharacterSet } = require("node-thermal-printer");

const ERP_URL = (process.env.ERP_URL || "http://localhost:3000").replace(/\/$/, "");
// Chave da unidade (HMAC) — gerar no servidor com: npx tsx scripts/print-agent-key.ts <slug-da-unidade>
const PRINT_AGENT_KEY = process.env.PRINT_AGENT_KEY || "";
const AUTH_HEADERS = PRINT_AGENT_KEY ? { Authorization: `Bearer ${PRINT_AGENT_KEY}` } : {};
const PRINTER_TYPE = process.env.PRINTER_TYPE || "epson"; // epson | star
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || "usb://0x04b8:0x0202";
const WIDTH = parseInt(process.env.PRINTER_WIDTH || "32", 10); // 32 = bobina 58mm, 48 = 80mm
const RETRY_MS = parseInt(process.env.RETRY_SECONDS || "20", 10) * 1000;
const STATE_DIR = process.env.STATE_DIR || __dirname;

const PRINTED_FILE = path.join(STATE_DIR, "printed.json");
const PENDING_FILE = path.join(STATE_DIR, "pending.json");

// ---------- estado em disco ----------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data));
  } catch (e) {
    console.error(`[state] Não consegui gravar ${file}:`, e.message);
  }
}

const printed = readJson(PRINTED_FILE, {}); // { orderId: timestamp }
const pending = new Set(readJson(PENDING_FILE, [])); // orderIds aguardando impressão

function markPrinted(orderId) {
  printed[orderId] = Date.now();
  const ids = Object.keys(printed);
  if (ids.length > 500) {
    ids.sort((a, b) => printed[a] - printed[b]).slice(0, ids.length - 500).forEach((id) => delete printed[id]);
  }
  writeJson(PRINTED_FILE, printed);
  pending.delete(orderId);
  writeJson(PENDING_FILE, [...pending]);
}

function addPending(orderId) {
  if (pending.has(orderId)) return;
  pending.add(orderId);
  writeJson(PENDING_FILE, [...pending]);
}

// ---------- ERP ----------

async function fetchOrder(orderId) {
  const res = await fetch(`${ERP_URL}/api/pedidos/${orderId}`, {
    headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
  });
  if (!res.ok) throw new Error(`Falha ao buscar pedido ${orderId}: ${res.status}`);
  return res.json();
}

const isOnlinePayment = (order) => String(order.payment?.method || "").startsWith("ONLINE_");

// ---------- cupom ----------
// Modelo igual ao cupom do sistema anterior: título, cabeçalho, cliente, endereço,
// itens, totais, "receber na entrega" e "cobrar do cliente" em destaque.

const TZ = "America/Sao_Paulo";

/** 1234.5 -> "1.234,50" (sem R$, como no cupom atual). */
function money(value) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Linha "rótulo ....... valor" ocupando a largura inteira da bobina. */
function row(left, right) {
  const spaces = Math.max(1, WIDTH - left.length - right.length);
  return left + " ".repeat(spaces) + right;
}

/** Nome do item cortado para caber ao lado do preço. */
function itemRow(left, price) {
  const room = WIDTH - price.length - 1;
  return row(left.length > room ? left.slice(0, room) : left, price);
}

const brDate = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" });
const brTime = (d) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const METHOD_LABEL = {
  CASH: "DINHEIRO",
  PIX: "PIX",
  CREDIT_CARD: "CREDITO (maq)",
  DEBIT_CARD: "DEBITO (maq)",
  VOUCHER: "VALE",
  INVOICE: "FATURADO",
  ONLINE_PIX: "PIX ONLINE",
  ONLINE_CREDIT: "CARTAO ONLINE",
  ONLINE_BOLETO: "BOLETO ONLINE",
};

function newPrinter() {
  return new ThermalPrinter({
    type: PRINTER_TYPE === "star" ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: PRINTER_INTERFACE.startsWith("share:") ? "tcp://127.0.0.1:9100" : PRINTER_INTERFACE,
    characterSet: CharacterSet.PC860_PORTUGUESE,
    removeSpecialCharacters: false,
    width: WIDTH,
  });
}

function buildReceipt(order) {
  const printer = newPrinter();
  const delivery = order.type !== "PICKUP";
  const payment = order.payment;
  const method = payment?.method;
  const alreadyPaid = payment?.status === "PAID" || method === "INVOICE";
  const firstName = String(order.customer.name || "").trim().split(/\s+/)[0].toLowerCase();

  const section = (title) => {
    printer.drawLine();
    printer.bold(true);
    printer.println(title);
    printer.bold(false);
  };

  printer.alignCenter();
  printer.bold(true);
  printer.println(delivery ? "PEDIDO DE ENTREGA" : "PEDIDO PARA RETIRADA");
  printer.bold(false);
  printer.alignLeft();

  printer.println(row(`Mov: ${brDate(order.createdAt)}`, `${delivery ? "Entrega" : "Retirada"} ${order.number} (${firstName})`));
  printer.println(row(`Pedido as ${brTime(order.createdAt)}h`, delivery ? `Entreg: ${order.courier?.name || "(nao informado)"}` : ""));

  section("Cliente");
  printer.println(`Nome: ${order.customer.name}`);
  printer.println(`Telefone: ${order.customer.phone}`);

  if (delivery && order.address) {
    section("Entregar em");
    printer.println(`Endereco: ${order.address.street}, ${order.address.number}`);
    printer.println(`Bairro: ${order.address.neighborhood}`);
    if (order.address.complement) printer.println(`Compl.: ${order.address.complement}`);
    printer.println(`Cidade: ${order.address.city}  CEP ${order.address.cep}`);
    if (order.deliveryZone?.name) printer.println(`Regiao: ${order.deliveryZone.name}`);
  }

  section("Pedido");
  for (const item of order.items) {
    printer.println(itemRow(`${item.quantity} ${String(item.name).toUpperCase()}`, money(item.total)));
    // Combo: lista o que foi escolhido (o que a cozinha precisa preparar)
    for (const c of item.components || []) printer.println(`   - ${c.quantity}x ${c.name}`);
    if (item.notes) printer.println(`   obs: ${item.notes}`);
  }

  printer.drawLine();
  printer.println(row("Total dos itens", money(order.subtotal)));
  if (delivery) printer.println(row("Entrega", money(order.deliveryFee || 0)));
  if (order.discount > 0) printer.println(row("Desconto", `-${money(order.discount)}`));
  printer.bold(true);
  printer.println(row("Total do pedido", money(order.total)));
  printer.bold(false);

  if (payment) {
    printer.drawLine();
    printer.println(delivery ? "RECEBER NA ENTREGA" : "RECEBER NA RETIRADA");
    const label = METHOD_LABEL[method] || method;
    if (alreadyPaid) {
      printer.println(`- ${label} - ${method === "INVOICE" ? "FATURADO" : "JA PAGO"}`);
    } else {
      printer.println(row(`- ${label}`, money(order.total)));
    }
  }

  if (order.notes) {
    section("Obs");
    printer.println(order.notes);
  }

  printer.drawLine();
  printer.bold(true);
  printer.setTextDoubleHeight();
  printer.println(alreadyPaid ? "NAO COBRAR (PAGO)" : `COBRAR DO CLIENTE ${money(order.total)}`);
  printer.setTextNormal();
  printer.bold(false);
  if (!alreadyPaid && (method === "CREDIT_CARD" || method === "DEBIT_CARD")) printer.println("- Levar maquina de cartao");
  if (!alreadyPaid && method === "CASH" && payment.changeAmount) printer.println(`- Levar troco para ${money(payment.changeAmount)}`);

  printer.newLine();
  printer.newLine();
  printer.cut();

  return printer;
}

// ---------- envio para a impressora ----------

function sendToShare(buffer, shareName) {
  if (!/^[\w .-]+$/.test(shareName)) throw new Error(`Nome de compartilhamento inválido: ${shareName}`);
  const tmp = path.join(os.tmpdir(), `banguelas-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(tmp, buffer);
  return new Promise((resolve, reject) => {
    execFile("cmd", ["/c", "copy", "/b", tmp, `\\\\localhost\\${shareName}`], { windowsHide: true }, (err, _out, stderr) => {
      fs.rm(tmp, { force: true }, () => {});
      if (err) reject(new Error(`copy falhou: ${stderr || err.message}`));
      else resolve();
    });
  });
}

function sendToTcp(buffer, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => socket.end(buffer));
    socket.setTimeout(10000, () => socket.destroy(new Error("timeout ao conectar na impressora")));
    socket.on("error", reject);
    socket.on("close", (hadError) => { if (!hadError) resolve(); });
  });
}

async function send(printer) {
  const buffer = printer.getBuffer();
  if (PRINTER_INTERFACE.startsWith("share:")) return sendToShare(buffer, PRINTER_INTERFACE.slice(6));
  if (PRINTER_INTERFACE.startsWith("tcp://")) {
    const { hostname, port } = new URL(PRINTER_INTERFACE);
    return sendToTcp(buffer, hostname, parseInt(port || "9100", 10));
  }
  // usb:// e serial: usa o transporte da própria biblioteca
  if (!(await printer.isPrinterConnected())) throw new Error("impressora não conectada");
  await printer.execute();
}

// ---------- fila ----------

let queue = Promise.resolve();
let retryTimer = null;

function scheduleRetry() {
  if (retryTimer || pending.size === 0) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    for (const id of pending) enqueue(id);
  }, RETRY_MS);
}

/** Imprime um pedido (um por vez). Em caso de falha, mantém na fila de pendentes. */
function enqueue(orderId, { event } = {}) {
  queue = queue.then(() => handle(orderId, event)).catch((e) => console.error("[print] Erro inesperado:", e));
  return queue;
}

async function handle(orderId, event) {
  if (printed[orderId]) return pending.delete(orderId); // já impresso (ex.: order_new e depois order_confirmed)
  try {
    const order = await fetchOrder(orderId);
    if (order.status === "CANCELLED") {
      console.log(`[print] Pedido #${order.number} cancelado — não imprime.`);
      markPrinted(orderId);
      return;
    }
    // Pagamento online só imprime depois de confirmado
    if (event === "order_new" && isOnlinePayment(order)) {
      console.log(`[print] Pedido #${order.number}: pagamento online, aguardando confirmação.`);
      return;
    }
    await send(buildReceipt(order));
    markPrinted(orderId);
    console.log(`[print] Pedido #${order.number} impresso.`);
  } catch (e) {
    console.error(`[print] Falha no pedido ${orderId}: ${e.message} — nova tentativa em ${RETRY_MS / 1000}s`);
    addPending(orderId);
    scheduleRetry();
  }
}

// ---------- SSE ----------

function connect() {
  const url = `${ERP_URL}/api/admin/events`;
  console.log(`[sse] Conectando em ${url}...`);

  const es = new EventSource(url, { headers: AUTH_HEADERS });

  es.onopen = () => console.log("[sse] Conectado.");
  es.onerror = (e) => {
    console.error("[sse] Erro de conexão — reconectando em 10s...", e.message || "");
    es.close();
    setTimeout(connect, 10000);
  };

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "order_confirmed" || data.type === "order_new") {
        console.log(`[sse] ${data.type} — pedido #${data.orderNumber}`);
        enqueue(data.orderId, { event: data.type });
      }
    } catch (e) {
      console.error("[sse] Evento inválido:", e.message);
    }
  };
}

connect();
for (const id of pending) enqueue(id); // pedidos que ficaram pendentes antes de reiniciar
console.log(`Banguelas Print Agent iniciado (${PRINTER_INTERFACE}, ${WIDTH} colunas). Aguardando pedidos...`);
