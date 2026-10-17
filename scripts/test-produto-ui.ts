// Fluxo da tela /admin/produtos: "Novo produto" + adicionar foto, em Chromium e Firefox, registrando o console.
// Uso: BASE=... EMAIL=... PASS=... npx tsx scripts/test-produto-ui.ts
import { chromium, firefox } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3998";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let bad = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? "ok  " : "FAIL", msg); if (!ok) bad++; };

(async () => {
  for (const [name, type] of [["chromium", chromium], ["firefox", firefox]] as const) {
    const browser = await (type as typeof chromium).launch(name === "chromium" ? { args: ["--no-sandbox"] } : {});
    const ctx = await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });
    const page = await ctx.newPage();
    const consoleMsgs: string[] = [];
    const jsErrors: string[] = [];
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 220)}`); });
    page.on("pageerror", (e) => jsErrors.push(e.message));
    page.on("dialog", (d) => { jsErrors.push(`alert: ${d.message()}`); d.dismiss(); });

    await page.goto(BASE + "/admin/login");
    await page.fill("input[type=email]", process.env.EMAIL!);
    await page.fill("input[type=password]", process.env.PASS!);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20000 }), page.click("button[type=submit]")]);

    await page.goto(BASE + "/admin/produtos");
    await page.waitForSelector("text=Novo produto");
    const nome = `Produto UI ${name} ${Date.now() % 100000}`;
    await page.click("button:has-text('Novo produto')");
    await page.waitForSelector("h2:has-text('Novo produto')", { timeout: 5000 });
    check(true, `[${name}] "Novo produto" abre o formulário`);
    check(await page.locator("button:has-text('Criar produto')").isDisabled(), `[${name}] não deixa criar sem nome/preço`);
    check(await page.locator("button:has(svg) >> text=Adicionar").first().isDisabled(), `[${name}] foto desabilitada até salvar`);

    await page.fill("input[placeholder='Nome do produto']", nome);
    await page.fill("input[type=number] >> nth=0", "19.9");
    await page.click("button:has-text('Criar produto')");
    await page.waitForSelector("text=Produto criado!", { timeout: 10000 });
    check(true, `[${name}] produto criado e modal segue em modo edição`);

    // adicionar foto
    const respUpload = page.waitForResponse((r) => r.url().includes("/api/upload") && r.request().method() === "POST");
    await page.setInputFiles("input[type=file]", { name: "foto.png", mimeType: "image/png", buffer: PNG });
    const up = await respUpload;
    check(up.status() === 200, `[${name}] upload da foto respondeu 200`);
    await page.waitForSelector("img[src^='/uploads/products/']", { timeout: 10000 });
    check(true, `[${name}] foto aparece no produto`);

    // salvar e conferir na lista
    await page.click("button:has-text('Salvar alterações')");
    await page.waitForSelector("h2:has-text('Editar produto')", { state: "detached", timeout: 10000 });
    await page.reload();
    await page.waitForSelector(`text=${nome}`);
    check(true, `[${name}] produto novo aparece na lista após recarregar`);

    const fileMsgs = consoleMsgs.filter((m) => /file:\/\/\//i.test(m));
    const cspMsgs = consoleMsgs.filter((m) => /content security policy|refused to/i.test(m));
    console.log(`     [${name}] mensagens de console: ${consoleMsgs.length}${consoleMsgs.length ? "\n       " + [...new Set(consoleMsgs)].join("\n       ") : ""}`);
    check(fileMsgs.length === 0, `[${name}] nenhum aviso de file:///`);
    check(cspMsgs.length === 0, `[${name}] nenhuma violação de CSP`);
    check(jsErrors.length === 0, `[${name}] sem erros de JS/alert${jsErrors.length ? ": " + jsErrors.join(" | ") : ""}`);
    await browser.close();
  }
  console.log(bad ? `\n${bad} FALHA(S)` : "\ntudo ok");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 3).join(" ")); process.exit(1); });
