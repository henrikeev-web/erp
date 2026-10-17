import { clearKey, clientIp, hit, isBlocked, recordFailure } from "../src/lib/rate-limit";
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); };
const T0 = 1_000_000;
// hit: 3 por janela de 10s
t("1ª passa", hit("a", 3, 10_000, T0).ok, true);
t("2ª passa", hit("a", 3, 10_000, T0 + 1).ok, true);
t("3ª passa", hit("a", 3, 10_000, T0 + 2).ok, true);
const r = hit("a", 3, 10_000, T0 + 3);
t("4ª bloqueia", r.ok, false);
t("Retry-After coerente", r.retryAfterSec >= 9 && r.retryAfterSec <= 10, true);
t("chave diferente não é afetada", hit("b", 3, 10_000, T0 + 3).ok, true);
t("libera após a janela", hit("a", 3, 10_000, T0 + 10_001).ok, true);
// falhas de login: 5 erros bloqueiam; sucesso zera
for (let i = 0; i < 4; i++) recordFailure("login:x", 60_000, T0);
t("4 falhas ainda livre", isBlocked("login:x", 5, T0).ok, true);
recordFailure("login:x", 60_000, T0);
t("5ª falha bloqueia", isBlocked("login:x", 5, T0).ok, false);
t("libera depois da janela", isBlocked("login:x", 5, T0 + 60_001).ok, true);
recordFailure("login:y", 60_000, T0); clearKey("login:y");
t("sucesso zera contador", isBlocked("login:y", 1, T0).ok, true);
// IP atrás do proxy: usa a entrada escrita pelo proxy confiável (a mais à direita), não a que o cliente forja
t("XFF forjado à esquerda é ignorado", clientIp({ get: (n: string) => (n === "x-forwarded-for" ? "6.6.6.6, 203.0.113.9" : null) }), "203.0.113.9");
t("sem forjar", clientIp({ get: (n: string) => (n === "x-forwarded-for" ? "203.0.113.9" : null) }), "203.0.113.9");
t("2 proxies confiáveis", clientIp({ get: (n: string) => (n === "x-forwarded-for" ? "6.6.6.6, 203.0.113.9, 10.0.0.2" : null) }, 2), "203.0.113.9");
t("objeto de headers (next-auth)", clientIp({ "x-forwarded-for": "1.1.1.1, 198.51.100.7" }), "198.51.100.7");
t("sem header: local", clientIp({ get: () => null }), "local");
console.log(bad ? `\n${bad} FALHA(S)` : "\ntudo ok");
process.exit(bad ? 1 : 0);
