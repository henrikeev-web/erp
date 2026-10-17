// Fluxo da tela /admin/cupons no Chromium: editar um cupom existente. Uso: BASE=... EMAIL=... PASS=... npx tsx scripts/test-cupom-ui.ts
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3998";
(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/admin/login");
  await page.fill("input[type=email]", process.env.EMAIL!);
  await page.fill("input[type=password]", process.env.PASS!);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20000 }), page.click("button[type=submit]")]);

  await page.goto(BASE + "/admin/cupons");
  await page.waitForSelector("code");
  // o botão de editar do cartão do cupom TESTE10 (o ancestral mais próximo que contém um botão de editar)
  const editBtn = () => page.locator("code", { hasText: "TESTE10" }).locator('xpath=ancestor::div[.//button[@title="Editar cupom"]][1]').locator('button[title="Editar cupom"]');
  await editBtn().click();
  await page.waitForSelector("text=Editar cupom");
  console.log("ok   modal abre em modo edição");
  const code = await page.inputValue('input[placeholder="EXEMPLO10"]');
  console.log(code === "TESTE10" ? "ok   formulário vem preenchido com o cupom" : `FAIL código no form: ${code}`);

  await page.fill('input[placeholder="10"], input[placeholder="15.00"]', "25");
  await page.fill('input[placeholder^="Ex: "]', "Cupom editado pela tela");
  await page.fill('input[type=date] >> nth=1', "2030-12-31");
  await page.click("text=Salvar alterações");
  await page.waitForSelector("text=Editar cupom", { state: "detached", timeout: 10000 });
  console.log("ok   salvou e fechou o modal");

  await page.reload();
  await page.waitForSelector("code");
  const body = await page.innerText("body");
  console.log(body.includes("Cupom editado pela tela") ? "ok   descrição nova aparece na lista" : "FAIL descrição não atualizou");
  console.log(/25(\.0+)?%|R\$\s?25/.test(body) ? "ok   valor novo aparece na lista" : "FAIL valor não atualizou");
  console.log(/Válido até 31\/12\/30/.test(body) ? "ok   validade nova aparece (31/12/30)" : "FAIL validade não atualizou");

  // reabre: os dados salvos voltam no formulário (inclui a data em Brasília)
  await editBtn().click();
  await page.waitForSelector("text=Editar cupom");
  const d = await page.inputValue('input[type=date] >> nth=1');
  console.log(d === "2030-12-31" ? "ok   data volta igual ao reabrir (sem deslocar um dia)" : `FAIL data ao reabrir: ${d}`);
  await browser.close();
  if (errors.length) { console.log("FAIL erros de JS:", errors.join(" | ")); process.exit(1); }
  console.log("tudo ok");
})().catch((e) => { console.error("FAIL", e.message.split("\n")[0]); process.exit(1); });
