import { isComboAvailable, optionCapacity, validateComboDefinition, validatePicks } from "../src/lib/combo";
let fail = 0;
const t = (label: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "OK    " : "FALHOU", label, ok ? "" : `\n   obtido:   ${JSON.stringify(got)}\n   esperado: ${JSON.stringify(want)}`); };
const opt = (id: string, maxQty: number | null, stock: number | null = 100, active = true) => ({ productId: id, name: id.toUpperCase(), maxQty, active, stock });
const O = [opt("frango", null), opt("carne", null), opt("peixe", 3), opt("legumes", null, 4)];

t("20 exatos, respeitando limites", validatePicks(O, 20, [{ productId: "frango", quantity: 10 }, { productId: "peixe", quantity: 3 }, { productId: "carne", quantity: 7 }]), { picks: [{ productId: "frango", quantity: 10 }, { productId: "peixe", quantity: 3 }, { productId: "carne", quantity: 7 }] });
t("20 do mesmo produto SEM limite (frango)", "picks" in validatePicks(O, 20, [{ productId: "frango", quantity: 20 }]), true);
t("peixe acima do limite (4 > 3)", validatePicks(O, 20, [{ productId: "peixe", quantity: 4 }, { productId: "frango", quantity: 16 }]), { error: "PEIXE: máximo de 3 por combo" });
t("20 de peixe (o caso da marmita cara)", validatePicks(O, 20, [{ productId: "peixe", quantity: 20 }]), { error: "PEIXE: máximo de 3 por combo" });
t("faltam itens", validatePicks(O, 20, [{ productId: "frango", quantity: 15 }]), { error: "Escolha mais 5 itens (o combo tem 20)" });
t("falta 1 (singular)", validatePicks(O, 20, [{ productId: "frango", quantity: 19 }]), { error: "Escolha mais 1 item (o combo tem 20)" });
t("passou de 20", validatePicks(O, 20, [{ productId: "frango", quantity: 21 }]), { error: "Você escolheu 1 a mais (o combo tem 20)" });
t("produto de fora do combo", validatePicks(O, 20, [{ productId: "intruso", quantity: 20 }]), { error: "Produto não faz parte deste combo" });
t("quantidade negativa", validatePicks(O, 20, [{ productId: "frango", quantity: -1 }]), { error: "Quantidade inválida no combo" });
t("quantidade fracionada", validatePicks(O, 20, [{ productId: "frango", quantity: 1.5 }]), { error: "Quantidade inválida no combo" });
t("zeros são ignorados", validatePicks(O, 2, [{ productId: "frango", quantity: 2 }, { productId: "carne", quantity: 0 }]), { picks: [{ productId: "frango", quantity: 2 }] });
t("mesmo produto repetido é somado (e o limite vale pela soma)", validatePicks(O, 20, [{ productId: "peixe", quantity: 2 }, { productId: "peixe", quantity: 2 }, { productId: "frango", quantity: 16 }]), { error: "PEIXE: máximo de 3 por combo" });
const sold = [opt("frango", null, 0), opt("carne", null)];
t("produto sem estoque não pode ser escolhido", validatePicks(sold, 5, [{ productId: "frango", quantity: 5 }]), { error: "FRANGO: sem estoque" });
t("produto inativo conta como sem estoque", validatePicks([opt("a", null, 10, false), opt("b", null)], 2, [{ productId: "a", quantity: 2 }]), { error: "A: sem estoque" });
t("produto sem controle de estoque (null) é ilimitado", "picks" in validatePicks([opt("a", null, null)], 20, [{ productId: "a", quantity: 20 }]), true);

t("disponível: soma das capacidades cobre 20", isComboAvailable(O, 20), true);
t("indisponível: tudo sem estoque", isComboAvailable([opt("a", null, 0), opt("b", null, 0)], 20), false);
t("indisponível: só sobram itens limitados (3+4=7 < 20)", isComboAvailable([opt("peixe", 3), opt("legumes", null, 4)], 20), false);
t("disponível no limite exato (10+10)", isComboAvailable([opt("a", 10), opt("b", 10)], 20), true);
t("capacidade respeita estoque, limite e tamanho", [optionCapacity(opt("x", 3), 20), optionCapacity(opt("x", null, 4), 20), optionCapacity(opt("x", null, 500), 20), optionCapacity(opt("x", 30), 20), optionCapacity(opt("x", null, 0), 20)], [3, 4, 20, 20, 0]);

t("cadastro: 20 com peixe limitado a 3 e frango livre", validateComboDefinition(20, [{ maxQty: 3 }, { maxQty: null }]), null);
t("cadastro: limites que impedem fechar 20 (3+3)", validateComboDefinition(20, [{ maxQty: 3 }, { maxQty: 3 }]) !== null, true);
t("cadastro: sem produtos", validateComboDefinition(20, []), "Escolha ao menos um produto para compor o combo");
t("cadastro: tamanho 1", validateComboDefinition(1, [{ maxQty: null }]) !== null, true);
t("cadastro: tamanho 201", validateComboDefinition(201, [{ maxQty: null }]) !== null, true);
t("cadastro: limite 0", validateComboDefinition(20, [{ maxQty: 0 }, { maxQty: null }]) !== null, true);
t("cadastro: tamanho decimal", validateComboDefinition(20.5, [{ maxQty: null }]) !== null, true);
console.log(fail ? `\n${fail} FALHA(S)` : "\ntodas passaram"); process.exit(fail ? 1 : 0);
