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
 *   win:NomeDaImpressora           Windows — envia RAW pelo spooler (sem compartilhar, sem administrador)
 *   share:NomeDoCompartilhamento   Windows — impressora compartilhada (copy /b \\localhost\Nome)
 *   tcp://192.168.1.100:9100       impressora de rede
 *   usb://0x04b8:0x0202            USB direto (Linux/macOS; no Windows prefira share:)
 *   /dev/ttyUSB0 | //./COM3        serial
 */


// Rede de segurança: qualquer erro mostra a mensagem, grava erro.log e espera uma tecla (a janela do .exe
// nunca fecha sozinha escondendo o motivo). No modo "run" (oculto) só grava o arquivo.
const HIDDEN_RUN = process.argv[2] === "run";
function pauseWindows() {
  if (process.platform !== "win32") return;
  try {
    require("child_process").spawnSync("cmd", ["/c", "pause"], { stdio: "inherit" });
  } catch { /* sem console */ }
}
function crash(err) {
  const msg = `${new Date().toISOString()} ${err && err.stack ? err.stack : err}\n`;
  for (const dir of [process.pkg ? require("path").dirname(process.execPath) : __dirname, require("os").tmpdir()]) {
    try {
      require("fs").appendFileSync(require("path").join(dir, "erro.log"), msg);
      break;
    } catch { /* tenta a próxima pasta */ }
  }
  if (!HIDDEN_RUN) {
    console.error(`\nERRO INESPERADO:\n${err && err.stack ? err.stack : err}\n`);
    pauseWindows();
  }
  process.exit(1);
}
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);
if (process.pkg && !HIDDEN_RUN) console.log("Banguelas Print Agent - iniciando...");

require("dotenv").config();
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { execFile } = require("child_process");
const EventSource = require("eventsource");
const { ThermalPrinter, PrinterTypes, CharacterSet } = require("node-thermal-printer");

const IS_EXE = !!process.pkg; // empacotado em banguelas-print.exe
const APP_DIR = IS_EXE ? path.dirname(process.execPath) : __dirname;
const CONFIG_FILE = path.join(APP_DIR, "config.json");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}
const cfg = readConfig(); // { erpUrl, key, printerName, width, type } — .env/variáveis de ambiente têm prioridade

const ERP_URL = (process.env.ERP_URL || cfg.erpUrl || "http://localhost:3000").replace(/\/$/, "");
// Chave da unidade (HMAC) — gerar no servidor com: npx tsx scripts/print-agent-key.ts <slug-da-unidade>
const PRINT_AGENT_KEY = process.env.PRINT_AGENT_KEY || cfg.key || "";
const AUTH_HEADERS = PRINT_AGENT_KEY ? { Authorization: `Bearer ${PRINT_AGENT_KEY}` } : {};
const PRINTER_TYPE = process.env.PRINTER_TYPE || cfg.type || "epson"; // epson | star
const PRINTER_INTERFACE =
  process.env.PRINTER_INTERFACE || (cfg.printerName ? `win:${cfg.printerName}` : "usb://0x04b8:0x0202");
const WIDTH = parseInt(process.env.PRINTER_WIDTH || cfg.width || "32", 10); // 32 = bobina 58mm, 48 = 80mm
const COPIES = Math.min(5, Math.max(1, parseInt(process.env.PRINT_COPIES || cfg.copies || "2", 10) || 2)); // vias por pedido
const RETRY_MS = parseInt(process.env.RETRY_SECONDS || "20", 10) * 1000;
const STATE_DIR = process.env.STATE_DIR || APP_DIR;

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
    interface: /^(share|win):/.test(PRINTER_INTERFACE) ? "tcp://127.0.0.1:9100" : PRINTER_INTERFACE,
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

  // 1º pedido do cliente: faixa preta com texto vazado
  if (order.isFirstOrder) {
    printer.alignCenter();
    printer.invert(true);
    printer.bold(true);
    printer.setTextDoubleHeight();
    printer.println(" *** 1o PEDIDO *** ");
    printer.setTextNormal();
    printer.bold(false);
    printer.invert(false);
    printer.alignLeft();
  }

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

// Envia bytes crus ao spooler do Windows (winspool RAW) — não precisa compartilhar a impressora nem ser administrador
const RAW_PS1 = `
param([string]$Printer, [string]$Data)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)] public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)] static extern bool OpenPrinter(string n, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)] static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)] static extern bool WritePrinter(IntPtr h, IntPtr p, int n, out int written);
  public static void Send(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter falhou (" + Marshal.GetLastWin32Error() + ") - impressora '" + printer + "' nao encontrada");
    try {
      DOCINFOA di = new DOCINFOA(); di.pDocName = "Pedido Banguelas"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter falhou (" + Marshal.GetLastWin32Error() + ")");
      StartPagePrinter(h);
      IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
      try { Marshal.Copy(bytes, 0, p, bytes.Length); int w; if (!WritePrinter(h, p, bytes.Length, out w) || w != bytes.Length) throw new Exception("WritePrinter falhou (" + Marshal.GetLastWin32Error() + ")"); }
      finally { Marshal.FreeCoTaskMem(p); }
      EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
"@
[RawPrint]::Send($Printer, [IO.File]::ReadAllBytes($Data))
`;

function sendToWindowsPrinter(buffer, name) {
  const stamp = `${process.pid}-${Date.now()}`;
  const bin = path.join(os.tmpdir(), `banguelas-${stamp}.bin`);
  const ps1 = path.join(os.tmpdir(), `banguelas-${stamp}.ps1`);
  fs.writeFileSync(bin, buffer);
  fs.writeFileSync(ps1, RAW_PS1);
  return new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Printer", name, "-Data", bin],
      { windowsHide: true, timeout: 30000 },
      (err, _out, stderr) => {
        fs.rm(bin, { force: true }, () => {});
        fs.rm(ps1, { force: true }, () => {});
        if (err) reject(new Error(String(stderr || err.message).trim().split("\n")[0]));
        else resolve();
      }
    );
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

/** Envia o cupom COPIES vezes num único trabalho de impressão (cada via termina com corte; ou saem todas, ou nenhuma). */
async function send(printer) {
  const one = printer.getBuffer();
  const buffer = Buffer.concat(Array.from({ length: COPIES }, () => one));
  if (PRINTER_INTERFACE.startsWith("win:")) return sendToWindowsPrinter(buffer, PRINTER_INTERFACE.slice(4));
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

function runAgent() {
  connect();
  for (const id of pending) enqueue(id); // pedidos que ficaram pendentes antes de reiniciar
  console.log(`Banguelas Print Agent iniciado (${PRINTER_INTERFACE}, ${WIDTH} colunas, ${COPIES} via${COPIES > 1 ? "s" : ""}). Aguardando pedidos...`);
}

// ---------- instalação / execução no Windows (.exe) ----------

const INSTALL_DIR = path.join(process.env.LOCALAPPDATA || APP_DIR, "BanguelasPrint");
// .exe: o próprio executável; script: node.exe (assinado) rodando o index.js instalado
const INSTALLED_EXE = IS_EXE ? path.join(INSTALL_DIR, "banguelas-print.exe") : process.execPath;
const INSTALLED_ENTRY = path.join(INSTALL_DIR, "index.js");
const STARTUP_VBS = path.join(
  process.env.APPDATA || APP_DIR, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "banguelas-print.vbs"
);
const LOCK_PORT = 47231;

/** Escolhe a térmica Epson na lista de impressoras do Windows (ou null se houver dúvida). */
function pickPrinter(names) {
  const match = names.filter((n) => /TM-?T20|EPSON.*(TM|RECEIPT)|RECEIPT/i.test(n));
  return match.length === 1 ? match[0] : null;
}

/** Atalho invisível na pasta Inicializar do usuário: roda sem janela, sem administrador e sem senha. */
function startupVbs(exe, entry) {
  const q = (p) => `""${p}""`; // aspas dobradas dentro de string VBScript
  const cmd = entry ? `${q(exe)} ${q(entry)} run` : `${q(exe)} run`;
  return `CreateObject("WScript.Shell").Run "${cmd}", 0, False\r\n`;
}

/** Encerra cópias antigas do agente (sem tocar em outros programas Node da máquina). */
function stopOthers() {
  const cmd = IS_EXE
    ? ["taskkill", ["/F", "/FI", "IMAGENAME eq banguelas-print.exe", "/FI", `PID ne ${process.pid}`]]
    : ["powershell", ["-NoProfile", "-NonInteractive", "-Command",
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*BanguelasPrint*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]];
  return new Promise((res) => execFile(cmd[0], cmd[1], { windowsHide: true }, () => setTimeout(res, 1000)));
}

function psList(command) {
  return new Promise((resolve, reject) => {
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true }, (err, out) =>
      err ? reject(err) : resolve(out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    );
  });
}

async function setup(rl) {
  const ask = async (q) => (await rl.question(q)).trim();
  if (process.platform !== "win32") throw new Error("A instalação automática é só para Windows.");

  console.log("Procurando impressoras...");
  const names = await psList("Get-Printer | Select-Object -ExpandProperty Name");
  if (!names.length) throw new Error("Nenhuma impressora instalada neste computador. Instale o driver da Epson TM-T20 e tente de novo.");

  let printer = pickPrinter(names);
  if (printer) {
    console.log(`Impressora encontrada: ${printer}`);
  } else {
    names.forEach((n, i) => console.log(`  ${i + 1}) ${n}`));
    const n = parseInt(await ask("Digite o número da impressora do cupom: "), 10);
    printer = names[n - 1];
    if (!printer) throw new Error("Número inválido.");
  }

  // Copia o programa e a configuração para uma pasta fixa (o usuário pode apagar a pasta baixada depois)
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  if (path.resolve(APP_DIR) !== path.resolve(INSTALL_DIR)) {
    await stopOthers();
    if (IS_EXE) fs.copyFileSync(process.execPath, INSTALLED_EXE);
    else for (const f of ["index.js", "package.json", "node_modules"]) fs.cpSync(path.join(APP_DIR, f), path.join(INSTALL_DIR, f), { recursive: true });
  }
  const config = { ...readConfig(), printerName: printer, width: cfg.width || 48, type: cfg.type || "epson" };
  fs.writeFileSync(path.join(INSTALL_DIR, "config.json"), JSON.stringify(config, null, 2));

  // Cupom de teste (confirma impressora e papel antes de instalar)
  process.env.PRINTER_INTERFACE = `win:${printer}`;
  console.log("Imprimindo cupom de teste...");
  await sendToWindowsPrinter(newPrinterFor(config).getBuffer(), printer);

  fs.mkdirSync(path.dirname(STARTUP_VBS), { recursive: true });
  fs.writeFileSync(STARTUP_VBS, startupVbs(INSTALLED_EXE, IS_EXE ? null : INSTALLED_ENTRY));
  execFile("wscript", [STARTUP_VBS], { windowsHide: true }, () => {});
  console.log("\nPronto! O agente já está rodando em segundo plano e vai iniciar sozinho sempre que o Windows abrir.");
  console.log(`Registro de atividade: ${path.join(INSTALL_DIR, "agent.log")}`);
}

/** Cupom de teste com a configuração recém-gravada (as constantes do módulo ainda refletem a config antiga). */
function newPrinterFor(config) {
  const p = new ThermalPrinter({
    type: config.type === "star" ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: "tcp://127.0.0.1:9100",
    characterSet: CharacterSet.PC860_PORTUGUESE,
    removeSpecialCharacters: false,
    width: config.width || 48,
  });
  p.alignCenter();
  p.bold(true);
  p.println("TESTE DE IMPRESSAO");
  p.bold(false);
  p.println("Banguelas - Print Agent");
  p.println(new Date().toLocaleString("pt-BR", { timeZone: TZ }));
  p.println("Acentuacao: ação, você, não, é, ç");
  p.println("Se voce leu isto, esta tudo certo!");
  p.newLine();
  p.newLine();
  p.cut();
  return p;
}

async function menu() {
  const readline = require("readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("=== Banguelas Print Agent ===\n");
    const installed = fs.existsSync(STARTUP_VBS) && fs.existsSync(IS_EXE ? INSTALLED_EXE : INSTALLED_ENTRY);
    let choice = "1";
    if (installed) {
      console.log("O agente já está instalado neste computador.");
      console.log("  1) Reinstalar / trocar a impressora (imprime um cupom de teste)");
      console.log("  2) Desinstalar");
      console.log("  3) Sair");
      choice = (await rl.question("Escolha: ")).trim();
    }
    if (choice === "1") await setup(rl);
    else if (choice === "2") {
      fs.rmSync(STARTUP_VBS, { force: true });
      await stopOthers();
      console.log("Desinstalado (o agente não inicia mais com o Windows).");
    }
  } catch (e) {
    console.error(`\nERRO: ${e.message}`);
  } finally {
    rl.close();
    console.log("");
    pauseWindows();
  }
}

/** Modo "run" do .exe: sem janela — grava o registro em agent.log e impede duas cópias rodando (duas cópias imprimiriam em dobro). */
function runHidden() {
  const logFile = path.join(STATE_DIR, "agent.log");
  try {
    if (fs.statSync(logFile).size > 2 * 1024 * 1024) fs.rmSync(logFile);
  } catch { /* sem log ainda */ }
  const write = (level) => (...args) =>
    fs.appendFile(logFile, `${new Date().toISOString()} ${level} ${args.join(" ")}\n`, () => {});
  console.log = write("INFO");
  console.error = write("ERRO");

  const lock = net.createServer();
  lock.on("error", () => process.exit(0)); // já existe um agente rodando
  lock.listen(LOCK_PORT, "127.0.0.1", runAgent);
}

module.exports = { pickPrinter, startupVbs };

if (require.main === module) {
  // run = oculto + agent.log (usado na inicialização); start = visível no terminal; menu = instalação
  const mode = process.argv[2] || (IS_EXE ? "menu" : "start");
  if (mode === "run") runHidden();
  else if (mode === "start") runAgent();
  else if (mode === "menu") menu().catch(crash);
  else console.error(`Modo desconhecido: ${mode}`);
}
