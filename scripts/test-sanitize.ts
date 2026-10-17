import { isGissUrl, parseCoupon, parseProductBasics, parseStockMove } from "../src/lib/sanitize";
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); };
const err = (r: any) => "error" in r;
// produto
t("ignora campos fora da lista", Object.keys((parseProductBasics({ name: "A", price: 10, sourceProductId: "x", unitId: "y", priceCustom: true, kind: "COMBO" }) as any).data), ["name", "price"]);
t("preço negativo", err(parseProductBasics({ price: -1 })), true);
t("preço zero", err(parseProductBasics({ price: 0 })), true);
t("preço NaN/texto", err(parseProductBasics({ price: "abc" })), true);
t("preço enorme", err(parseProductBasics({ price: 1e9 })), true);
t("preço em string com vírgula", (parseProductBasics({ price: "12,5" }) as any).data.price, 12.5);
t("nome vazio", err(parseProductBasics({ name: "  " })), true);
t("nome gigante", err(parseProductBasics({ name: "a".repeat(201) })), true);
t("priceOriginal vazio vira null", (parseProductBasics({ priceOriginal: "" }) as any).data.priceOriginal, null);
t("active não-boolean", err(parseProductBasics({ active: "true" })), true);
t("idade fracionada", err(parseProductBasics({ ageMin: 1.5 })), true);
// cupom
t("cupom: só active no PATCH", (parseCoupon({ active: false, usedCount: 0, unitId: "x" }, true) as any).data, { active: false });
t("cupom: usedCount nunca passa", "usedCount" in (parseCoupon({ usedCount: 0, active: true }, true) as any).data, false);
t("cupom: código com espaço/símbolo", err(parseCoupon({ type: "FIXED", code: "A B;", value: 5 }, false)), true);
t("cupom: % acima de 100", err(parseCoupon({ type: "PERCENTAGE", code: "X", value: 150 }, false)), true);
t("cupom: valor negativo", err(parseCoupon({ type: "FIXED", code: "X", value: -5 }, false)), true);
t("cupom: frete grátis ignora valor", (parseCoupon({ type: "FREE_DELIVERY", code: "frete", value: 99 }, false) as any).data.value, 0);
t("cupom: código em maiúsculas", (parseCoupon({ type: "FIXED", code: "oi10", value: 5 }, false) as any).data.code, "OI10");
t("cupom: data inválida", err(parseCoupon({ validTo: "ontem" }, true)), true);
// estoque
t("estoque: negativo", err(parseStockMove({ type: "IN", quantity: -5 })), true);
t("estoque: texto", err(parseStockMove({ type: "IN", quantity: "abc" })), true);
t("estoque: fracionado", err(parseStockMove({ type: "OUT", quantity: 1.5 })), true);
t("estoque: tipo inválido", err(parseStockMove({ type: "DROP", quantity: 1 })), true);
t("estoque: ajuste para zero vale", (parseStockMove({ type: "ADJUSTMENT", quantity: 0 }) as any).data.quantity, 0);
t("estoque: IN zero inválido", err(parseStockMove({ type: "IN", quantity: 0 })), true);
t("estoque: ok", (parseStockMove({ type: "IN", quantity: 10, reason: "compra" }) as any).data, { type: "IN", quantity: 10, reason: "compra" });
// GISS
for (const u of ["https://ws-sjrp.giss.com.br/service-ws/nf/nfse-ws", "https://giss.com.br/x"]) t(`GISS aceita ${u}`, isGissUrl(u), true);
for (const u of ["http://ws-sjrp.giss.com.br/x", "https://evil.com/giss.com.br", "https://giss.com.br.evil.com/x", "https://user:pw@ws.giss.com.br/", "https://notgiss.com.br/", "ftp://x.giss.com.br", ""]) t(`GISS recusa ${u}`, isGissUrl(u), false);
console.log(bad ? `\n${bad} FALHA(S)` : "\ntudo ok");
process.exit(bad ? 1 : 0);
