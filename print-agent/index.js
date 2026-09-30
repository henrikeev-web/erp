/**
 * Banguelas Print Agent
 *
 * Runs on the store computer. Subscribes to the ERP SSE stream and
 * automatically prints confirmed orders to a thermal printer via ESC/POS.
 *
 * Setup:
 *   1. Copy print-agent/.env.example to print-agent/.env and fill in values
 *   2. npm install
 *   3. node index.js  (or pm2 start index.js --name banguelas-print)
 *
 * Printer connection types: usb, serial, network (TCP/IP)
 */

require("dotenv").config();
const EventSource = require("eventsource");
const { ThermalPrinter, PrinterTypes, CharacterSet } = require("node-thermal-printer");

const ERP_URL = process.env.ERP_URL || "http://localhost:3000";
// Chave da unidade (HMAC) — gerar no servidor com: npx tsx scripts/print-agent-key.ts <slug-da-unidade>
const PRINT_AGENT_KEY = process.env.PRINT_AGENT_KEY || "";
const AUTH_HEADERS = PRINT_AGENT_KEY ? { Authorization: `Bearer ${PRINT_AGENT_KEY}` } : {};
const PRINTER_TYPE = process.env.PRINTER_TYPE || "epson"; // epson | star
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || "usb://0x04b8:0x0202"; // USB VID:PID — adjust to your printer
// For network: "tcp://192.168.1.100:9100"
// For serial:  "/dev/ttyUSB0" (Linux) or "//./COM3" (Windows)

const printer = new ThermalPrinter({
  type: PRINTER_TYPE === "star" ? PrinterTypes.STAR : PrinterTypes.EPSON,
  interface: PRINTER_INTERFACE,
  characterSet: CharacterSet.PC860_PORTUGUESE,
  removeSpecialCharacters: false,
  width: 32,
});

async function fetchOrder(orderId) {
  const res = await fetch(`${ERP_URL}/api/pedidos/${orderId}`, {
    headers: {
      "Content-Type": "application/json",
      ...AUTH_HEADERS,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch order ${orderId}: ${res.status}`);
  return res.json();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

async function printOrder(orderId) {
  console.log(`[print] Fetching order ${orderId}...`);
  const order = await fetchOrder(orderId);

  try {
    await printer.isPrinterConnected();
  } catch (e) {
    console.error("[print] Printer not connected:", e.message);
    return;
  }

  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println("BANGUELAS");
  printer.setTextNormal();
  printer.println("Papinhas e Nutricao Infantil");
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  printer.bold(true);
  printer.println(`Pedido #${order.number}`);
  printer.bold(false);
  printer.println(new Date(order.createdAt).toLocaleString("pt-BR"));
  printer.println(order.type === "PICKUP" ? "RETIRADA" : "DELIVERY");
  printer.drawLine();

  printer.bold(true);
  printer.println("CLIENTE");
  printer.bold(false);
  printer.println(order.customer.name);
  printer.println(order.customer.phone);

  if (order.address) {
    printer.drawLine();
    printer.bold(true);
    printer.println("ENDERECO");
    printer.bold(false);
    printer.println(`${order.address.street}, ${order.address.number}`);
    if (order.address.complement) printer.println(order.address.complement);
    printer.println(`${order.address.neighborhood} - ${order.address.city}`);
    printer.println(`CEP ${order.address.cep}`);
  }

  printer.drawLine();
  printer.bold(true);
  printer.println("ITENS");
  printer.bold(false);

  for (const item of order.items) {
    const line = `${item.quantity}x ${item.name}`;
    const total = formatCurrency(item.total);
    const spaces = 32 - line.length - total.length;
    printer.println(line + " ".repeat(Math.max(1, spaces)) + total);
    if (item.notes) printer.println(`  obs: ${item.notes}`);
  }

  printer.drawLine();
  printer.println(`Subtotal:${" ".repeat(Math.max(1, 23 - "Subtotal:".length))}${formatCurrency(order.subtotal)}`);
  if (order.deliveryFee > 0) {
    printer.println(`Frete:${" ".repeat(Math.max(1, 23 - "Frete:".length))}${formatCurrency(order.deliveryFee)}`);
  }
  if (order.discount > 0) {
    printer.println(`Desconto:${" ".repeat(Math.max(1, 23 - "Desconto:".length))}-${formatCurrency(order.discount)}`);
  }
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println(`TOTAL:${" ".repeat(Math.max(1, 23 - "TOTAL:".length))}${formatCurrency(order.total)}`);
  printer.setTextNormal();
  printer.bold(false);

  if (order.payment) {
    printer.drawLine();
    const methodMap = { CASH: "Dinheiro", PIX: "PIX", ONLINE_PIX: "PIX Online", CREDIT_CARD: "Cartao", ONLINE_CREDIT: "Cartao Online" };
    printer.println(`Pgto: ${methodMap[order.payment.method] || order.payment.method}`);
    if (order.payment.changeAmount) printer.println(`Troco para: ${formatCurrency(order.payment.changeAmount)}`);
  }

  if (order.notes) {
    printer.drawLine();
    printer.bold(true);
    printer.println("OBS:");
    printer.bold(false);
    printer.println(order.notes);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println("Obrigado pela preferencia!");
  printer.println("www.banguelas.com.br");
  printer.cut();

  await printer.execute();
  printer.clear();
  console.log(`[print] Order #${order.number} printed successfully.`);
}

function connect() {
  const url = `${ERP_URL}/api/admin/events`;
  console.log(`[sse] Connecting to ${url}...`);

  const es = new EventSource(url, { headers: AUTH_HEADERS });

  es.onopen = () => console.log("[sse] Connected.");
  es.onerror = (e) => {
    console.error("[sse] Connection error — reconnecting in 10s...", e.message || "");
    es.close();
    setTimeout(connect, 10000);
  };

  es.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "order_confirmed" || data.type === "order_new") {
        console.log(`[sse] Event: ${data.type} — order #${data.orderNumber}`);
        await printOrder(data.orderId);
      }
    } catch (e) {
      console.error("[sse] Failed to handle event:", e.message);
    }
  };
}

connect();
console.log("Banguelas Print Agent started. Waiting for orders...");
