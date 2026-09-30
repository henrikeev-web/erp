import { computeProgress } from "../src/lib/awards";
let fail = 0;
const t = (label: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "OK    " : "FALHOU", label, ok ? "" : `\n   obtido:   ${JSON.stringify(got)}\n   esperado: ${JSON.stringify(want)}`); };
const d = (s: string) => new Date(s);
const orders = (...rows: [string, number][]) => rows.map(([c, total]) => ({ createdAt: d(c), total }));
const base = { startsAt: null, endsAt: null };

const o5 = orders(["2026-01-01", 10], ["2026-01-02", 10], ["2026-01-03", 10], ["2026-01-04", 10], ["2026-01-05", 10]);
t("ORDERS: meta 3 cruza no 3º pedido", computeProgress({ ...base, metric: "ORDERS", threshold: 3 }, o5), { value: 5, achievedAt: d("2026-01-03") });
t("ORDERS: meta 5 cruza exatamente no 5º", computeProgress({ ...base, metric: "ORDERS", threshold: 5 }, o5).achievedAt, d("2026-01-05"));
t("ORDERS: meta 6 não atingida", computeProgress({ ...base, metric: "ORDERS", threshold: 6 }, o5), { value: 5, achievedAt: null });
t("SALES: R$ 25 cruza no 3º pedido (10+10+10=30)", computeProgress({ ...base, metric: "SALES", threshold: 25 }, o5).achievedAt, d("2026-01-03"));
t("SALES: R$ 30 cruza exatamente no 3º (>=)", computeProgress({ ...base, metric: "SALES", threshold: 30 }, o5).achievedAt, d("2026-01-03"));
t("SALES: pedido grande cruza sozinho", computeProgress({ ...base, metric: "SALES", threshold: 100 }, orders(["2026-02-01", 20], ["2026-02-02", 500])).achievedAt, d("2026-02-02"));
t("SALES: soma com centavos não deriva", computeProgress({ ...base, metric: "SALES", threshold: 0.3 }, orders(["2026-01-01", 0.1], ["2026-01-02", 0.1], ["2026-01-03", 0.1])).value, 0.3);
t("sem pedidos", computeProgress({ ...base, metric: "ORDERS", threshold: 1 }, []), { value: 0, achievedAt: null });

const win = { metric: "ORDERS" as const, threshold: 2, startsAt: d("2026-01-03"), endsAt: d("2026-01-05T23:59:59") };
t("janela: só conta pedidos dentro (03 a 05/01)", computeProgress(win, o5), { value: 3, achievedAt: d("2026-01-04") });
t("janela: pedidos antes do início não contam", computeProgress({ ...win, threshold: 4 }, o5), { value: 3, achievedAt: null });
t("janela: só início", computeProgress({ metric: "ORDERS", threshold: 2, startsAt: d("2026-01-04"), endsAt: null }, o5).achievedAt, d("2026-01-05"));
t("janela: só fim", computeProgress({ metric: "ORDERS", threshold: 2, startsAt: null, endsAt: d("2026-01-02") }, o5).achievedAt, d("2026-01-02"));
t("SALES: 0,10 + 0,20 bate a meta de R$ 0,30 (ponto flutuante)", computeProgress({ ...base, metric: "SALES", threshold: 0.3 }, orders(["2026-01-01", 0.1], ["2026-01-02", 0.2])).achievedAt, d("2026-01-02"));
console.log(fail ? `\n${fail} FALHA(S)` : "\ntodas passaram"); process.exit(fail ? 1 : 0);
