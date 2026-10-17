import { originForUnit, publicOrigin, safeReturnPath } from "../src/lib/google-login";
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); };
const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
process.env.BASE_DOMAIN = "banguelas.com.br"; process.env.AUTH_HOST = "cardapio.banguelas.com.br";
// produção: atrás do proxy o req.url vem como localhost; o Host real é o que vale
t("matriz", publicOrigin(h({ host: "cardapio.banguelas.com.br" }), "https://localhost:3000"), "https://cardapio.banguelas.com.br");
t("franquia", publicOrigin(h({ host: "ribeirao.banguelas.com.br", "x-forwarded-proto": "https" }), "https://localhost:3000"), "https://ribeirao.banguelas.com.br");
t("x-forwarded-host tem prioridade", publicOrigin(h({ host: "localhost:3000", "x-forwarded-host": "ribeirao.banguelas.com.br" }), "x"), "https://ribeirao.banguelas.com.br");
t("Host forjado cai no AUTH_HOST", publicOrigin(h({ host: "evil.com" }), "https://localhost:3000"), "https://cardapio.banguelas.com.br");
t("sufixo parecido é recusado", publicOrigin(h({ host: "evilbanguelas.com.br" }), "x"), "https://cardapio.banguelas.com.br");
t("sem Host", publicOrigin(h({}), "https://localhost:3000"), "https://cardapio.banguelas.com.br");
t("originForUnit matriz", originForUnit("matriz", "https://ribeirao.banguelas.com.br"), "https://cardapio.banguelas.com.br");
t("originForUnit franquia", originForUnit("ribeirao", "https://cardapio.banguelas.com.br"), "https://ribeirao.banguelas.com.br");
t("originForUnit sufixo parecido não casa", originForUnit("matriz", "https://evilbanguelas.com.br"), "https://evilbanguelas.com.br");
// dev (sem BASE_DOMAIN)
delete process.env.BASE_DOMAIN; delete process.env.AUTH_HOST;
t("dev localhost", publicOrigin(h({ host: "localhost:3000" }), "http://localhost:3000"), "http://localhost:3000");
t("dev subdomínio", publicOrigin(h({ host: "cidade.localhost:3000" }), "x"), "http://cidade.localhost:3000");
t("dev Host estranho usa o fallback", publicOrigin(h({ host: "evil.com" }), "http://localhost:3000"), "http://localhost:3000");
t("returnTo externo recusado", safeReturnPath("//evil.com"), "/minha-conta");
console.log(bad ? `\n${bad} FALHA(S)` : "\ntudo ok");
process.exit(bad ? 1 : 0);
