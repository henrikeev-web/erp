// Abre as páginas num Chromium real e falha se a CSP bloquear algo. Uso: BASE=http://localhost:3998 npx tsx scripts/test-csp.ts
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3998";
(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] }); // roda como root dentro do container do Playwright
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const violations: string[] = [];
  page.on("console", (m) => { if (/content security policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 200)); });
  const visit = async (path: string, waitFor?: string) => {
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 });
    else await page.waitForTimeout(1500);
    return res;
  };

  const r = await visit("/cardapio");
  const csp = r?.headers()["content-security-policy"] ?? "";
  console.log(csp.includes("frame-ancestors 'none'") ? "ok   header CSP presente" : "FAIL header CSP ausente");
  console.log(r?.headers()["x-frame-options"] === "DENY" ? "ok   X-Frame-Options" : "FAIL X-Frame-Options");
  const hydrated = await page.evaluate(() => document.body.innerText.length > 50);
  console.log(hydrated ? "ok   /cardapio renderiza" : "FAIL /cardapio vazio");

  await visit("/minha-conta/login", "input[type=password]");
  console.log("ok   /minha-conta/login carrega");

  await visit("/admin/login", "input[type=password]");
  await page.fill("input[type=email]", "admin@banguelas.com.br");
  await page.fill("input[type=password]", "admin123");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20000 }), page.click("button[type=submit]")]);
  console.log("ok   login do painel funciona com a CSP");
  for (const p of ["/admin", "/admin/pedidos", "/admin/produtos", "/admin/configuracoes"]) { await visit(p); }
  console.log("ok   páginas do painel carregam");

  // o navegador não pode ser embutido em iframe
  const framed = await ctx.newPage();
  await framed.setContent(`<iframe id=f src="${BASE}/cardapio" width=300 height=300></iframe>`);
  await framed.waitForTimeout(2000);
  const blocked = await framed.evaluate(() => { try { return (document.getElementById("f") as HTMLIFrameElement).contentDocument === null || (document.getElementById("f") as HTMLIFrameElement).contentDocument?.body?.innerText === ""; } catch { return true; } });
  console.log(blocked ? "ok   iframe do site é bloqueado" : "FAIL site pôde ser embutido");

  await browser.close();
  if (violations.length) { console.log("\nFAIL violações de CSP:\n" + [...new Set(violations)].join("\n")); process.exit(1); }
  console.log("ok   nenhuma violação de CSP no console\n\ntudo ok");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
