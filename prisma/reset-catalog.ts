/**
 * Reset de catálogo: remove todos os produtos e categorias fictícias
 * e cadastra os produtos reais da Banguelas (fonte: references/Lista produtos goomer.xlsx).
 *
 * Uso: npx tsx prisma/reset-catalog.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/delivery_erp",
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma: any = new (PrismaClient as any)({ adapter });

// ─── CATEGORIAS ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Refeições com sal",    slug: "com-sal",             ageMin: 12, ageMax: 48,  order: 1 },
  { name: "Papinhas sem sal",     slug: "sem-sal",             ageMin: 6,  ageMax: 24,  order: 2 },
  { name: "Papinhas doces",       slug: "papinhas-doces",      ageMin: 6,  ageMax: 24,  order: 3 },
  { name: "Lanchinhos",           slug: "lanchinhos",          ageMin: 9,  ageMax: null, order: 4 },
  { name: "Combinhos práticos",   slug: "combinhos-praticos",  ageMin: 6,  ageMax: null, order: 5 },
  { name: "Caldos",               slug: "caldos",              ageMin: 24, ageMax: null, order: 6 },
  { name: "Arraiá",               slug: "arraia",              ageMin: 6,  ageMax: null, order: 7 },
  { name: "Caseirinhos",          slug: "caseirinhos",         ageMin: 9,  ageMax: null, order: 8 },
  { name: "Páscoa",               slug: "pascoa",              ageMin: 9,  ageMax: null, order: 9 },
  { name: "Natal",                slug: "natal",               ageMin: 9,  ageMax: null, order: 10 },
] as const;

// ─── PRODUTOS ────────────────────────────────────────────────────────────────

interface ProductDef {
  name: string;
  description: string;
  price: number;
  categorySlug: string;
  weight?: number;
  featured?: boolean;
  order: number;
}

const PRODUCTS: ProductDef[] = [
  // ── COM SAL ──────────────────────────────────────────────────────────────
  {
    name: '"Pê-efinho" de carne moída',
    description:
      'Refeição individual 200 a 220g. O "PF" do seu banguela chegou! Arroz parboilizado, feijão carioca, carne moída com o molho de tomate caseiro e mix de legumes (batata inglesa e cenoura) refogado no azeite. Sem nada de leite e derivado, nem farinhas e ovo.',
    price: 16.9,
    categorySlug: "com-sal",
    weight: 210,
    featured: true,
    order: 1,
  },
  {
    name: "Panelinha de tutu e carne de panela",
    description:
      "Refeição individual 220g. Arroz branco, tutu de feijão (contém apenas feijão, tomate, farinha de mandioca, cheiro verde) e a deliciosa carne que tanto amam de panela com mandioca.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 220,
    order: 2,
  },
  {
    name: "Polentinha cremosa",
    description:
      "Refeição individual 210 a 230g. A polentinha cremosa foi muito pedida e SIM ficou incrível! Polenta cremosíssima (Fubá) com molho de tomate caseiro, carne moída, ervilha fresca e cenourinhas! Contém muçarela - existe a opção de pedir SEM avisando com antecedência.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 220,
    featured: true,
    order: 3,
  },
  {
    name: "Peixinho no molho",
    description:
      "Refeição individual 220g. Faltava essa delícia com peixinho para completar nosso cardápio! Com molho de tomate caseiro e leite de coco! Arroz branco, batata inglesa e ervilha fresca. Não contém nenhum tipo de farinha. Não contém leite e derivados.",
    price: 17.3,
    categorySlug: "com-sal",
    weight: 220,
    order: 4,
  },
  {
    name: "Bifinho a rolê",
    description:
      "Refeição individual 220 a 240g. É hora de experimentar a receita mais saborosa de todas! Arroz branco parboilizado, carne bovina, vagem, cenoura, molho de tomate caseiro e creme de batata inglesa. Não contém leite e derivado, farinhas nem ovo.",
    price: 22.9,
    categorySlug: "com-sal",
    weight: 230,
    featured: true,
    order: 5,
  },
  {
    name: "Creme de feijão preto com carne",
    description:
      "Refeição individual 200 a 210g. Quer ver seu banguela raspando o pratinho!? Creme de feijão preto com legumes, macarrãozinho e carne bovina. Não contém nenhum tipo de farinha (cremosa com o próprio feijão), apenas o trigo e traços de ovos do macarrãozinho.",
    price: 16.3,
    categorySlug: "com-sal",
    weight: 205,
    order: 6,
  },
  {
    name: "Charutinho baby",
    description:
      "Refeição individual 210 a 220g. Vai ser difícil achar um bebê que não vai se apaixonar por essa marmitinha! Arroz branco, carne moída, cenoura ralada, repolho verde, brócolis e muito do nosso molho de tomate caseiro! Não contém leite e derivado.",
    price: 16.3,
    categorySlug: "com-sal",
    weight: 215,
    order: 7,
  },
  {
    name: "Nhoquinho de batata doce à bolonhesa",
    description:
      "Refeição individual 200 a 220g. Massa do nhoque de batata doce, espinafre, aveia triturada, amido apenas para empanar, molho de tomate caseiro, carne moída, temperinhos naturais. Contém muçarela por cima. Não contém ovo nem trigo.",
    price: 17.3,
    categorySlug: "com-sal",
    weight: 210,
    order: 8,
  },
  {
    name: "Parmegiana de forno",
    description:
      "Refeição individual 190 a 200g. Arroz branco parboilizado, parmegiana de forno (carne moída, cenoura, temperinhos naturais, massa de tomate e aveia) e legumes refogados (batata inglesa e vagem). Contém muçarela. Sem farinha branca e ovo.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 195,
    order: 9,
  },
  {
    name: "Mexidão com creme de cabotiã",
    description:
      "Refeição individual 180 a 200g. Arroz branco parboilizado, ovo mexido no azeite com abobrinha ralada e cúrcuma. Creme de cabotiã. Não contém leite e derivado nem farinhas.",
    price: 16.3,
    categorySlug: "com-sal",
    weight: 190,
    order: 10,
  },
  {
    name: "Galinhadinha nutritiva",
    description:
      "Refeição individual 200 a 210g. Galinhada feita com arroz integral e sobrecoxa de frango sem adicionar nenhuma gordura na receita. Com muitos legumes: cenoura, vagem, tomate e milho. Sem leite e derivado, nem farinhas e ovo.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 205,
    order: 11,
  },
  {
    name: "Macarronada à bolonhesa",
    description:
      "Refeição individual 200 a 210g. Macarrão parafuso com molho de tomate caseiro e carne moída. Cenoura e brócolis refogados. Contém glúten e ovo (do macarrão); Sem leite e derivado.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 205,
    order: 12,
  },
  {
    name: "Marmita de nuggets caseiro",
    description:
      "Refeição individual 220 a 230g. Arroz branco parboilizado, feijão carioca, mix de legumes (batata, cenoura, brócolis) temperados no azeite e nosso nuggets caseiro de frango (Peito de frango, cenoura, aveia, temperinhos naturais, azeite e sal). Não contém leite e derivado, nem ovo e farinha branca.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 225,
    order: 13,
  },
  {
    name: "Franguinho com quiabo e batata doce assada",
    description:
      "Refeição individual 210 a 220g. Arroz branco com lentilha, batata doce assada com azeite, sobrecoxa de frango no molho de tomate com quiabo. Sem leite e derivado, nem ovo e farinhas.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 215,
    order: 14,
  },
  {
    name: "Escondidinho de carne com cabotiã",
    description:
      "Refeição individual 210 a 220g. Escondidinho delicioso de carne moída no molho de tomate e mix de legumes com um creme de cabotiã. Não leva leite e derivado no creme, porém contém MUÇARELA por cima! Conseguimos produzir sem, pedindo com antecedência.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 215,
    order: 15,
  },
  {
    name: "Escondidinho de frango com batata doce",
    description:
      "Refeição individual 210 a 220g. Escondidinho delicioso de frango desfiado no molho de tomate e mix de legumes com um creme de batata doce. Não leva leite e derivado no creme, porém contém MUÇARELA por cima! Conseguimos produzir sem, pedindo com antecedência.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 215,
    order: 16,
  },
  {
    name: "Panquequinha rosa com frango",
    description:
      "Refeição individual 200 a 220g. Panqueca de aveia e beterraba na massa. Recheio de frango desfiado com cenoura, batata, brócolis e tomate. Arroz branco parboilizado e por cima molho de tomate caseiro com milho e cheiro verde. Contém leite integral na receita da panqueca e ovo. Sem farinha branca (apenas aveia).",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 210,
    order: 17,
  },
  {
    name: "Marmita de almôndega caseira",
    description:
      "Refeição individual 220 a 230g. Arroz branco parboilizado, feijão carioca, mix de legumes e as almôndegas caseiras (Carne bovina, cenoura, temperinhos, aveia, azeite e sal) junto do molho de tomate. Não contém leite e derivado, apenas aveia triturada. Sem farinha branca e ovo.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 225,
    order: 18,
  },
  {
    name: "Estrogonofe de frango com batata doce",
    description:
      "Refeição individual 200 a 210g. Estrogonofe especial feito à base de creme de inhame e molho de tomate caseiro. Com cubinhos de frango, grão de bico, mostarda Dijon, arroz branco parboilizado e batata doce assada. Sem nenhum tipo de farinha, amido, leite e derivado.",
    price: 16.3,
    categorySlug: "com-sal",
    weight: 205,
    order: 19,
  },
  {
    name: "Bifinho na chapa com legumes",
    description:
      "Refeição individual 200 a 210g. Arroz branco parboilizado, feijão carioca, mix de legumes com azeite e temperinhos, bife na chapa com azeite. Não contém leite e derivado, ovos e nenhum tipo de farinha.",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 205,
    order: 20,
  },
  {
    name: "Creminho de milho com frango",
    description:
      "Refeição individual 210 a 230g. Arroz branco parboilizado, peito de frango com mix de legumes, creme de milho de puro milho! Sem leite e derivados, sem nada de farinha e amido!",
    price: 16.9,
    categorySlug: "com-sal",
    weight: 220,
    order: 21,
  },

  // ── SEM SAL ──────────────────────────────────────────────────────────────
  {
    name: "Franguinho e creme de batata com couve",
    description:
      "Refeição individual 200 a 210g. Arroz branco (bem cozido e úmido), feijão carioca, creme de batata inglesa com pedaços de couve, filezinho de frango na chapa com cúrcuma. Temperos naturais. Sem leite e derivado; sem trigo e farinhas.",
    price: 16.9,
    categorySlug: "sem-sal",
    weight: 205,
    order: 1,
  },
  {
    name: "Carne de panela e mix de legumes",
    description:
      "Refeição individual 200 a 210g. Arroz branco (bem cozido e úmido), feijão carioca, carne de panela cheia de temperinhos naturais e tomate em cubos, mix de brócolis e couve flor selados na frigideira com azeite e tempero. Sem leite e derivado; sem trigo e farinhas.",
    price: 16.9,
    categorySlug: "sem-sal",
    weight: 205,
    order: 2,
  },
  {
    name: "Macarrãozinho com legumes",
    description:
      "Papinha pedacinho 140g. Macarrão argolinha, molho de tomate caseiro com carne desfiada, cenoura ralada, abobrinha ralada, cebola, alho, salsinha desidratada, orégano apenas por cima. SEM SAL. Contém trigo e traços de ovo (macarrão).",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 3,
  },
  {
    name: "Pê-efinho baby",
    description:
      "Papinha pedacinho 150g. Refeição bebê, cheia de pedacinhos apenas com o feijão amassadinho! Arroz branco, feijão carioca, carne moída, tomate, batata inglesa, e cenourinha. SEM SAL.",
    price: 12.9,
    categorySlug: "sem-sal",
    weight: 150,
    featured: true,
    order: 4,
  },
  {
    name: "Papinha de fígado bovino",
    description:
      "Papinha pedacinho 140g. Arroz, feijão carioca, fígado bovino, cenoura, azeite, cebola, alho, cheiro verde. SEM SAL.",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 5,
  },
  {
    name: "Papinha de grão de bico e frango",
    description:
      "Papinha pedacinho 140g. Grão de bico, frango desfiado, quinoa, abobrinha, cebola, alho, cheiro verde e salsinha. SEM SAL.",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 6,
  },
  {
    name: "Papinha batata doce, carne e espinafre",
    description:
      "Papinha pedacinho 140g. Batata doce, batata inglesa, caldo de carne caseiro, carne bovina desfiada, espinafre, cebola, alho. SEM SAL.",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 7,
  },
  {
    name: "Palitinhos de legumes e sobrecoxa",
    description:
      "Refeição sem sal em formato de palitinhos para mais dinamismo e autonomia dos bebês. Cenoura, batata inglesa, brócolis, sobrecoxa de frango desossada, azeite, alho, cebola e salsinha desidratada. 100g.",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 100,
    order: 8,
  },
  {
    name: "Risotinho de frango e legumes",
    description:
      "Refeição individual 180g. Risoto bem molinho e cheio de nutrientes variados! Arroz arbóreo, frango, cenoura, batata, brócolis, caldo de frango caseiro, cebola, azeite, alho, cheiro verde. Não contém leite e derivados, trigo e farinha branca, ovo. SEM SAL.",
    price: 14.3,
    categorySlug: "sem-sal",
    weight: 180,
    featured: true,
    order: 9,
  },
  {
    name: "Risotinho de mandioquinha",
    description:
      "Refeição individual 180g. Risoto bem molinho e cheio de nutrientes variados! Arroz arbóreo, caldo de legumes caseiro, mandioquinha, tomate cereja, cebola, azeite, alho, cheiro verde. Não contém leite e derivados, trigo e farinha branca, ovo. SEM SAL.",
    price: 14.3,
    categorySlug: "sem-sal",
    weight: 180,
    order: 10,
  },
  {
    name: "Risotinho de carne",
    description:
      "Refeição individual 180g. Risoto bem molinho e cheio de nutrientes variados! Arroz arbóreo, carne bovina, cabotiã, cebola, azeite, alho, cheiro verde, cúrcuma. Não contém leite e derivados, trigo e farinha branca, ovo. SEM SAL.",
    price: 14.3,
    categorySlug: "sem-sal",
    weight: 180,
    order: 11,
  },
  {
    name: "Papinha peixinho",
    description:
      "Papinha amassadinha 140g. Arroz, lentilha, brócolis, peixinho desfiado, batata inglesa, cenoura. Tudo amassado, SEM SAL. Não contém farinhas, ovo, leite e derivados.",
    price: 12.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 12,
  },
  {
    name: "Amassadinha 3 cores",
    description:
      "Papinha amassadinha 140g. Arroz, grão de bico, beterraba, mandioquinha, cabotiã, batata inglesa, temperinhos naturais! Tudo amassado, SEM SAL. Não contém farinhas, ovo, sem leite e derivados.",
    price: 12.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 13,
  },
  {
    name: "Creme mandioquinha",
    description:
      "Papinha cremosa 140g. Mandioquinha, batata inglesa, azeite, cebola, alho, salsinha apenas por cima. SEM SAL.",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 14,
  },
  {
    name: "Creme de beterraba, frango e inhame",
    description:
      "Papinha cremosa 140g. Beterraba, inhame, cenoura, frango, cebola, alho, azeite, salsinha. SEM SAL.",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 15,
  },
  {
    name: "Creme de feijão e carne bovina",
    description:
      "Papinha cremosa 140g. Feijão, batata inglesa, carne bovina, azeite, cebola, alho. SEM SAL.",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 16,
  },
  {
    name: "Creme de cenoura e gema de ovo",
    description:
      "Papinha cremosa 140g. Cenoura, batata inglesa, gema de ovo cozida, azeite, alho, salsinha, cebola. SEM SAL.",
    price: 11.9,
    categorySlug: "sem-sal",
    weight: 140,
    order: 17,
  },

  // ── PAPINHAS DOCES ───────────────────────────────────────────────────────
  {
    name: "Creme de goiaba e inhame",
    description:
      "Creminho doce 100g. Inhame, goiaba, banana. Um delicioso creme docinho e suave para o bebê a partir dos 6 meses se deliciar e manter a imunidade lá em cima. Sem açúcar, sem adoçante, sem leite.",
    price: 9.9,
    categorySlug: "papinhas-doces",
    weight: 100,
    order: 1,
  },
  {
    name: "Creme de manga e inhame",
    description:
      "Creminho doce 100g. Inhame, manga. Um delicioso creme docinho para o bebê a partir dos 6 meses se deliciar e manter a imunidade lá em cima. Sem açúcar, sem adoçante, sem leite.",
    price: 9.9,
    categorySlug: "papinhas-doces",
    weight: 100,
    order: 2,
  },
  {
    name: "Creme de morango",
    description:
      "Creminho doce 100g. Banana, morango. Um delicioso creme docinho pra bebê a partir dos 6 meses. Sem açúcar, sem adoçante, sem leite.",
    price: 9.9,
    categorySlug: "papinhas-doces",
    weight: 100,
    order: 3,
  },
  {
    name: "Mingau de maçã e uva branca",
    description:
      "Papinha doce pedacinho 100g. Maçã em cubinhos, uva passa branca triturada, aveia e canela. Um delicioso creme docinho para o bebê a partir dos 6 meses. Sem açúcar, sem adoçante, sem leite.",
    price: 9.9,
    categorySlug: "papinhas-doces",
    weight: 100,
    order: 4,
  },
  {
    name: "Creme de maracujá, manga e inhame",
    description:
      "Creminho doce 100g. Inhame, manga, maracujá. Um delicioso creme docinho pra bebê a partir dos 6 meses se deliciar e manter a imunidade lá em cima. Sem açúcar, sem adoçante, sem leite.",
    price: 9.9,
    categorySlug: "papinhas-doces",
    weight: 100,
    order: 5,
  },

  // ── LANCHINHOS ───────────────────────────────────────────────────────────
  {
    name: "Bolo de cacau",
    description:
      "Pacote com 4 unidades (>9 meses). Bolo de cacau 100% com sabor intenso e textura perfeita! Ingredientes: Farinha de aveia, uva passa preta, ovo, leite de coco, farinha de trigo, cacau 100%, fermento. Não contém leite e derivados, não contém açúcares e adoçantes. Contém trigo e ovo.",
    price: 15.9,
    categorySlug: "lanchinhos",
    featured: true,
    order: 1,
  },
  {
    name: "Bolinho de banana",
    description:
      "Pacote com 4 unidades (>9 meses). Bolinho docinho, rico em fibras e perfeito pra encaixar na mãozinha! Ingredientes: Banana, uva passa branca, farinha de aveia, ovo, fermento, uma pitada de canela. Não contém leite e derivados, açúcares e adoçantes, trigo e farinha branca. Contém ovo.",
    price: 13.9,
    categorySlug: "lanchinhos",
    order: 2,
  },
  {
    name: "Bolinho de cenoura",
    description:
      "Pacote com 4 unidades (>9 meses). De sabor suave da cenoura e textura macia da aveia não tem quem resista. Ingredientes: Cenoura, uva branca, leite de coco, farinha de aveia, ovo, polvilho doce. Não contém leite e derivados, açúcares e adoçantes, trigo. Contém ovo.",
    price: 13.9,
    categorySlug: "lanchinhos",
    order: 3,
  },
  {
    name: "Bolinho de cenoura com cacau",
    description:
      "Pacote com 4 unidades (>9 meses). Bolinho de cenoura com creme de cacau! Ingredientes: Cenoura, uva branca, leite de coco, farinha de aveia, ovo, polvilho doce. Creminho de cacau e tâmara: Banana, tâmara e cacau 100%. Não contém leite e derivados, açúcares e adoçantes, trigo. Contém ovo.",
    price: 14.9,
    categorySlug: "lanchinhos",
    order: 4,
  },
  {
    name: "Bolinho de milho com leite de coco",
    description:
      "Pacote com 4 unidades (>9 meses). Bolinho de milho no formato de vaquinha e mini cupcake! Macio, sabor suave e super nutritivo! Ingredientes: Milho, uva branca, leite de coco, fubá, ovos, aveia, fermento. Não contém leite e derivados, açúcares e adoçantes, trigo e farinha branca. Contém ovo.",
    price: 13.9,
    categorySlug: "lanchinhos",
    order: 5,
  },
  {
    name: "Panquequinha de banana e aveia",
    description:
      "4 unidades de panqueca. Ingredientes: Banana, ovo, aveia e uma pitada de canela. Sem leite e derivado; sem açúcar e adoçante; sem trigo. Contém ovo. Opções: Simples R$14,90 / C/ creme de cacau R$20,90 / C/ geleia de morango caseira R$21,90.",
    price: 14.9,
    categorySlug: "lanchinhos",
    order: 6,
  },
  {
    name: "Muffin de abobrinha com muçarela",
    description:
      "Pacote com 4 unidades (>1 aninho). Muffin salgado de abobrinha e muçarela! Super nutritivo, macio e bem temperado. Ingredientes: Abobrinha, ovo, muçarela, farinha de aveia, psylium, cebola, alho, salsinha, fermento, uma pitada de sal. Não contém trigo e farinha branca. Contém derivado de leite e ovo.",
    price: 13.9,
    categorySlug: "lanchinhos",
    order: 7,
  },
  {
    name: "Pão caseiro de beterraba",
    description:
      "Pacote com 4 unidades (>9 meses). Pãozinho caseiro cheio de fibras da beterraba, da linhaça e da aveia! Ingredientes: Farinha de trigo, beterraba, farinha de aveia, farinha de linhaça dourada, azeite, água, fermento, uma pitada de sal. Não contém ovo, leite, açúcar. Contém trigo.",
    price: 13.9,
    categorySlug: "lanchinhos",
    order: 8,
  },
  {
    name: "Marombinha (salgado assado de frango)",
    description:
      "Pacote com 6 unidades (>9 meses). Mini salgadinho assado feito com a cremosidade da batata doce! Ingredientes: Batata doce, peito de frango, azeite, farinha de aveia, cúrcuma, uma pitada de sal, polvilhado no fubá. Não contém leite e derivados, trigo nem ovo.",
    price: 14.9,
    categorySlug: "lanchinhos",
    order: 9,
  },
  {
    name: "Pão de beijo",
    description:
      "Pacote com 8 unidades (>9 meses). Pãozinho com a mesma textura de pão de queijo mas SEM queijo! A batata doce deixa com um sabor adocicado e fácil de mastigar. Ingredientes: Batata doce, polvilho, azeite, semente de chia, cúrcuma, cebola e alho desidratado, uma pitada de sal. Não contém leite e derivados, trigo e ovo.",
    price: 13.9,
    categorySlug: "lanchinhos",
    order: 10,
  },
  {
    name: "Nuggets caseiro — porção",
    description:
      "Pacote com 4 unidades (>9 meses). Nuggets de frango assado super temperadinho com ingredientes naturais. Ingredientes: Peito de frango, cenoura, cebola, azeite, aveia, cheiro verde, alho, cúrcuma, linhaça dourada, pouquinho de sal. Não contém leite e derivados, trigo e farinha branca nem ovo.",
    price: 14.9,
    categorySlug: "lanchinhos",
    order: 11,
  },
  {
    name: "Brigadeiro baby",
    description:
      "A unidade. Seu bebê precisa experimentar esse cremoso docinho! Para lanches, festinhas ou a sobremesa do final de semana! Ingredientes: Banana, batata doce, cacau 100%, leite em pó, aveia. Não contém açúcares e adoçantes. Não contém trigo e nem ovo. Contém derivado de leite.",
    price: 4.0,
    categorySlug: "lanchinhos",
    order: 12,
  },
  {
    name: "Brownie feijão preto",
    description:
      "Pacote com 2 unidades (>2 anos). Brownie cremoso e absurdamente saboroso, feito com feijão preto e cacau 100%! Ingredientes: Feijão preto, cacau 100%, óleo de coco, aveia, açúcar mascavo e gotas de chocolate meio amargo. Não contém trigo e farinha branca, ovo. Contém açúcar mascavo e derivado de leite (do chocolate amargo).",
    price: 12.9,
    categorySlug: "lanchinhos",
    order: 13,
  },
  {
    name: "Almôndega caseira — porção",
    description:
      "Pacote com 6 unidades. Mini almôndega de carne bovina assada com cenoura. Ingredientes: Carne bovina, cenoura, cebola, farinha de aveia, cheiro verde, tomate, azeite, uma pitada de sal. Não contém leite e derivados, trigo e farinha branca. Molho de tomate caseiro por cima com orégano.",
    price: 14.9,
    categorySlug: "lanchinhos",
    order: 14,
  },
  {
    name: "Quibe de carne assado",
    description:
      "Unidade individual (>8 meses). Quibe assado macio e temperadinho com ingredientes naturais. Ingredientes: Carne bovina, trigo para quibe, cebola, cenoura, alho, hortelã, pouquinho de sal. Não contém leite e derivados, nem ovo. Contém trigo.",
    price: 16.9,
    categorySlug: "lanchinhos",
    order: 15,
  },
  {
    name: "Bolo de beterraba",
    description:
      "Contém 4 unidades tamanho cupcake (>2 anos). Bolinho delicioso, de textura macia e com a doçura da beterraba. Ótimo para bebês/crianças mais crescidinhas. Não contém leite e nenhum tipo de gordura. Mais de 60% de aveia triturada. Contém açúcar, sem exageros!",
    price: 16.3,
    categorySlug: "lanchinhos",
    order: 16,
  },
  {
    name: "02 Pizzas de queijo com brócolis",
    description:
      "2 pizzas por porção. Massa de batata doce e aveia! Sem nada de trigo, nada de ovo! Leva nosso molho caseiro de tomate. Sabor delicioso de queijo e brócolis!",
    price: 16.3,
    categorySlug: "lanchinhos",
    order: 17,
  },
  {
    name: "02 Pizzas de queijo",
    description:
      "2 pizzas por porção. Massa de batata doce e aveia! Sem nada de trigo, nada de ovo! Leva nosso molho caseiro de tomate. Sabor delicioso de queijo e tomatinho!",
    price: 16.3,
    categorySlug: "lanchinhos",
    order: 18,
  },
  {
    name: "Bolo de maçã e chocolate meio amargo",
    description:
      "Contém 4 unidades tamanho cupcake (>2 anos). Sem nada de trigo, nada de gordura e nada de laticínios na massa. Aroma incrível de banana, maçã e açúcar mascavo. Com muita aveia e com gotas de chocolate amargo. Contém derivado de leite do chocolate.",
    price: 17.4,
    categorySlug: "lanchinhos",
    order: 19,
  },

  // ── COMBINHOS PRÁTICOS ───────────────────────────────────────────────────
  {
    name: "20 refeições com sal",
    description:
      "*20 REFEIÇÕES DELICIOSAS E ZERO CORRERIA NA HORA DO ALMOÇO* 02 Polentinha + 03 Pê-efinho + 03 Mexidão + 03 Creme de milho com frango + 03 Parmegiana de forno + 03 Escondidinho de frango + 03 Estrogonofe de frango. *sujeito a alterações se necessário*",
    price: 312.0,
    categorySlug: "combinhos-praticos",
    featured: true,
    order: 1,
  },
  {
    name: "20 refeições sem sal",
    description:
      "*20 REFEIÇÕES SEM SAL DELICIOSAS E ZERO CORRERIA NA HORA DO ALMOÇO* 03 Pê-efinho baby + 03 Amassadinha 3 cores + 03 Fígado bovino + 02 Creme de cenoura + 03 Grão de bico, quinoa, frango + 03 Creme de beterraba + 03 Batata doce, espinafre e carne. *sujeito a alterações se necessário*",
    price: 199.0,
    categorySlug: "combinhos-praticos",
    featured: true,
    order: 2,
  },
  {
    name: 'Dias "relax"! 10 refeições com sal',
    description:
      "* 10 REFEIÇÕES DELICIOSAS - 02 Marmitinhas Parmegiana + 02 Marmitinha Frango com quiabo + 02 Marmitinha Estrogonofe de frango + 01 Marmitinha Polentinha cremosa + 01 Marmitinha Bifinho na chapa + 01 Marmitinha Escondidinho de carne + 01 Marmitinha Mexidão com creme de cabotiã. *sujeito a alterações se necessário*",
    price: 159.0,
    categorySlug: "combinhos-praticos",
    order: 3,
  },
  {
    name: "Para semana — 07 refeições COM sal",
    description:
      "* 7 REFEIÇÕES DELICIOSAS - 02 Marmitinha Polentinha + 01 Marmitinha Creme de feijão preto + 02 Marmitinha Creme de Milho + 01 Marmitinha Mexidão + 01 Marmitinha Escondidinho de carne. *sujeito a alterações se necessário*",
    price: 110.0,
    categorySlug: "combinhos-praticos",
    order: 4,
  },
  {
    name: "Para a semana — 07 refeições SEM sal",
    description:
      "* 7 REFEIÇÕES DELICIOSAS PARA SEU BEBÊ <1 ANO* - 01 Palitinho de legumes - 01 Creme de beterraba - 02 Macarrãozinho - 01 Papinha de batata doce, carne e espinafre - 01 Papinha de fígado bovino - 01 Risotinho de frango com legumes. *sujeito a alterações se necessário*",
    price: 75.0,
    categorySlug: "combinhos-praticos",
    order: 5,
  },
  {
    name: "Combo lanchinhos — 10 PACOTES!",
    description:
      "* MAIS DE 40 UNIDADES DE LANCHINHOS -- 01 pacote de bolo de cacau + 01 pacote de bolo de Beterraba (contém açúcar) + 02 pacotes de bolinhos de banana + 01 pacote de bolinho de milho + 02 pacotes de bolinhos de cenoura + 01 pacote de muffim abobrinha + 01 pacote pão de beijo + 01 pacote de marombinha. *sujeito a alterações se necessário*",
    price: 140.0,
    categorySlug: "combinhos-praticos",
    order: 6,
  },
  {
    name: "Para semana (Bebê) — 10 ITENS",
    description:
      "* 07 REFEIÇÕES BEBÊ SEM SAL + 01 PCT DE LANCHE + 02 PAPINHAS DOCES - 02 Risotinhos + 05 Papinhas variadas (consultar sabores da semana) + 01 pacote do bolinho de banana + 02 Cremes doces (consultar sabores da semana).",
    price: 110.0,
    categorySlug: "combinhos-praticos",
    order: 7,
  },
  {
    name: "COMBO — PARA FAMÍLIA!",
    description:
      "2 caldos/sopas (veja a opção disponível!) 1 marmitinha galinhada 1 marmitinha pê efinho 1 marmitinha escondidinho de carne 1 marmitinha estrogonofe de frango. *sujeito a alterações se necessário*",
    price: 109.0,
    categorySlug: "combinhos-praticos",
    order: 8,
  },

  // ── CALDOS ───────────────────────────────────────────────────────────────
  {
    name: "Caldo de mandioca com costela e brócolis",
    description:
      "Caldo de 400g. Indicamos aquecer no microondas, mexendo de vez em quando no centro para ficar 100% quentinho. Ingredientes: Mandioca, costela bovina, linguicinha defumada, brócolis, cebola, alho, sal, cheiro verde, chimichurri e páprica defumada.",
    price: 24.9,
    categorySlug: "caldos",
    weight: 400,
    featured: true,
    order: 1,
  },
  {
    name: "Sopa de feijão com carne bovina e linguicinha",
    description:
      "Caldo de 400g. Indicamos aquecer no microondas, mexendo de vez em quando no centro. Ingredientes: Feijão carioca, carne bovina (patinho), linguicinha, macarrãozinho, couve manteiga, cebola, alho, azeite, sal, chimichurri, colorau, cheiro verde e páprica defumada. CONTÉM TRIGO E OVO (macarrãozinho). Contém Glúten.",
    price: 24.9,
    categorySlug: "caldos",
    weight: 400,
    order: 2,
  },
  {
    name: "Canja com frango e mix de legumes",
    description:
      "Caldo de 400g. Indicamos aquecer no microondas, mexendo de vez em quando no centro. Ingredientes: Arroz branco, filé de frango, cenoura, tomate, batata inglesa, ervilha fresca, cebola, alho, azeite, sal, chimichurri, cheiro verde, cúrcuma.",
    price: 24.9,
    categorySlug: "caldos",
    weight: 400,
    order: 3,
  },

  // ── ARRAIÁ ───────────────────────────────────────────────────────────────
  {
    name: "Biscoitinho de tâmara",
    description:
      "Biscoitinhos de tâmara e aveia! Para bebês maiores de 9 meses, porção individual (5 biscoitinhos juninos), de textura macia e SEM PASSAR PELO ULTRACONGELADOR. Ingredientes: Farinha de aveia, tâmara jumbo sem caroço, óleo de girassol, fermento, extrato de baunilha.",
    price: 16.9,
    categorySlug: "arraia",
    order: 1,
  },
  {
    name: "Arroz docinho",
    description:
      "Porção individual. Arroz docinho com ingredientes 100% naturais para bebês de introdução alimentar! Molinho e delicioso para comer quente ou geladinho! Ingredientes: Arroz branco, leite de coco, tâmara jumbo, uva passa.",
    price: 10.9,
    categorySlug: "arraia",
    order: 2,
  },
  {
    name: "Bolo de milho com goiabada — por encomenda",
    description:
      "Mais de meio quilo de uma bandeirinha de bolo de milho com goiabada para a turma toda! Ingredientes naturais para crianças e bebês maiores de 9 meses! Milho, flocão de milho, leite de coco, uva passa, aveia e fermento. Para a goiabada: apenas goiaba, tâmara e maçã! Contém ovo.",
    price: 59.9,
    categorySlug: "arraia",
    order: 3,
  },
  {
    name: "Docinho de abóbora",
    description:
      "Porção individual. Docinho cremoso de abóbora com coco! Com ingredientes naturais para todas as crianças e bebês de introdução alimentar. Ingredientes: Abóbora madura, uva passa, leite de coco, coco seco, cravo da índia em pó.",
    price: 10.9,
    categorySlug: "arraia",
    order: 4,
  },
  {
    name: "Bolinho de milho com queijo",
    description:
      "Contém 4 bolinhos por pacote. Lanchinho salgado delicioso com a perfeita combinação de milho e muçarela! Ingredientes: Flocão de milho, leite de coco, milho, ovos, muçarela, cheiro verde, sal e fermento. Contém ovo e derivado de leite.",
    price: 14.9,
    categorySlug: "arraia",
    order: 5,
  },

  // ── CASEIRINHOS ──────────────────────────────────────────────────────────
  {
    name: "Bolo caseiro de banana",
    description:
      "Uma opção deliciosa, docinha e saudável para todos! SEM TRIGO, LEITE, AÇÚCARES E ADOÇANTES. Opções: Sem calda R$60,00 / C/ calda de cacau (sem leite) R$68,00 / C/ calda de leite R$68,00.",
    price: 60.0,
    categorySlug: "caseirinhos",
    order: 1,
  },
  {
    name: "Bolo caseiro de cenoura",
    description:
      "Uma opção deliciosa, docinha e saudável para todos! SEM TRIGO, LEITE, AÇÚCARES E ADOÇANTES. Opções: Sem calda R$60,00 / C/ calda de cacau (sem leite) R$68,00 / C/ calda de leite R$68,00.",
    price: 60.0,
    categorySlug: "caseirinhos",
    order: 2,
  },
  {
    name: "Bolo caseiro de cacau",
    description:
      "Uma opção deliciosa, docinha e saudável para todos! SEM LEITE, AÇÚCARES E ADOÇANTES. Opções: Sem calda R$60,00 / C/ calda de cacau (sem leite) R$68,00 / C/ calda de leite R$68,00.",
    price: 60.0,
    categorySlug: "caseirinhos",
    order: 3,
  },

  // ── PÁSCOA ───────────────────────────────────────────────────────────────
  {
    name: "Bolo coelho (Cacau, cobertura de leite)",
    description:
      "Massa deliciosa do bolo 100% cacau, contém aveia, cacau 100%, leite de coco, uva passa, ovo, trigo, fermento. Calda: leite puro integral e batata doce. *não contém açúcares e adoçantes*",
    price: 42.9,
    categorySlug: "pascoa",
    order: 1,
  },
  {
    name: "Bolo coelho (Cenoura, cobertura cacau)",
    description:
      "Massa deliciosa do bolo de cenoura, contém cenoura, uva passa branca, farinha de aveia, ovo, leite de coco, amido, fermento. Calda: leite de coco, tâmara e cacau. *não contém trigo, açúcares e adoçantes, leite e derivado*",
    price: 42.9,
    categorySlug: "pascoa",
    order: 2,
  },
  {
    name: "Bolo coelho (Banana, cobertura cacau)",
    description:
      "Massa deliciosa do bolo de banana, contém banana, uva passa branca, farinha de aveia, ovo, fermento e uma pitada de canela. Calda: leite de coco, tâmara e cacau. *não contém trigo, açúcares e adoçantes, leite e derivado*",
    price: 42.9,
    categorySlug: "pascoa",
    order: 3,
  },
  {
    name: "Biscoitinho de tâmara — PÁSCOA",
    description:
      "Para bebês maiores de 9 meses. Biscoitinhos de tâmara e aveia, porção individual (5 biscoitinhos Páscoa), com textura macia e SEM PASSAR PELO ULTRACONGELADOR. Ingredientes: Farinha de aveia, tâmara jumbo sem caroço, óleo de coco, extrato de baunilha puro, fermento.",
    price: 18.0,
    categorySlug: "pascoa",
    order: 4,
  },
  {
    name: "Trufinha de chocolate",
    description:
      "3 trufinhas com muito chocolate, para bebês maiores de 9 meses. Chocolate amargo adoçado com tâmara (Não contém: açúcar e adoçante, leite e derivado, nada de origem animal, alergênicos, corantes e conservantes), batata doce e óleo de coco.",
    price: 19.9,
    categorySlug: "pascoa",
    order: 5,
  },
  {
    name: "Coelhinho de chocolate",
    description:
      "6 coelhinhos para bebês maiores de 9 meses! Chocolate amargo adoçado com tâmara (Não contém: açúcar e adoçante, leite e derivado, nada de origem animal, alergênicos, corantes e conservantes).",
    price: 20.9,
    categorySlug: "pascoa",
    order: 6,
  },

  // ── NATAL ────────────────────────────────────────────────────────────────
  {
    name: "Biscoitinho de tâmara — NATAL",
    description:
      "Biscoitinhos de tâmara e aveia, uma porção individual (5 biscoitinhos natalinos), com textura macia e SEM PASSAR PELO ULTRACONGELADOR. Para bebês maiores de 9 meses. Ingredientes: Farinha de aveia, tâmara jumbo sem caroço, óleo de coco, extrato de baunilha puro, fermento.",
    price: 15.9,
    categorySlug: "natal",
    order: 1,
  },
  {
    name: "Panetone baby",
    description:
      "Panetoninho delicioso! Com opção ultracongelada ou fresquinha (dura 3 dias na geladeira). Para bebês maiores de 9 meses. Ingredientes: Laranja, farinha de aveia, tâmara jumbo sem caroço, uva passa, óleo de girassol, farinha de arroz, polvilho doce, fermento, extrato de baunilha puro, canela, goma xantana. *Colocar nas observações se prefere fresquinho ou ultracongelado*",
    price: 21.9,
    categorySlug: "natal",
    order: 2,
  },
  {
    name: "Chocotone baby",
    description:
      "Chocotoninho! Com opção ultracongelada ou fresquinha (dura 3 dias na geladeira). Para bebês maiores de 9 meses. Ingredientes: Laranja, farinha de aveia, tâmara jumbo sem caroço, uva passa, gotas de chocolate amargo (sem leite, sem açúcar), óleo de girassol, farinha de arroz, polvilho doce, fermento, extrato de baunilha puro, canela, goma xantana. *Colocar nas observações se prefere fresquinho ou ultracongelado*",
    price: 21.9,
    categorySlug: "natal",
    order: 3,
  },
  {
    name: "Coração de chocolate",
    description:
      "Para bebês maiores de 9 meses. Porção com 06 mini corações de chocolate puro! Não leva nada de leite nem derivado, nada de açúcar, adoçantes, nenhum tipo de alergênico. Produto apropriado para veganos e vegetarianos. Ingredientes: Cacau (manteiga de cacau, massa de cacau e cacau em pó), leite de coco em pó e tâmara.",
    price: 16.9,
    categorySlug: "natal",
    order: 4,
  },
  {
    name: "Bolo de cenoura — formato Árvore de Natal",
    description:
      "Uma fofura de árvore de Natal dos nossos bolinhos. Massa do bolinho de cenoura com cobertura de cacau (leite de coco, tâmara e cacau 100%)!",
    price: 49.9,
    categorySlug: "natal",
    order: 5,
  },
  {
    name: "Bolo de cacau 100% — formato Árvore de Natal",
    description:
      "Uma fofura de árvore de Natal dos nossos bolinhos. Massa do bolo de cacau 100% com cobertura de cacau (leite de coco, tâmara e cacau 100%)!",
    price: 49.9,
    categorySlug: "natal",
    order: 6,
  },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🧹 Iniciando limpeza do catálogo fictício...\n");

  // Buscar brand
  const brand = await prisma.brand.findUnique({ where: { slug: "banguelas" } });
  if (!brand) {
    throw new Error('Brand "banguelas" não encontrada. Execute o seed.ts primeiro.');
  }

  // Só a unidade informada (padrão: matriz) — nunca as demais franquias.
  //   npx tsx prisma/reset-catalog.ts [slug-da-unidade]
  const unitSlug = process.argv[2] ?? "matriz";
  const unit = await prisma.unit.findUnique({ where: { slug: unitSlug } });
  if (!unit) throw new Error(`Unidade "${unitSlug}" não encontrada. Execute o seed.ts primeiro.`);
  console.log(`Unidade alvo: ${unit.name} (${unit.slug})\n`);

  // ── 1. Limpar dados dependentes de pedidos ────────────────────────────────
  const deletedLoyaltyTx = await prisma.loyaltyTransaction.deleteMany({ where: { order: { unitId: unit.id } } });
  console.log(`  ✓ Transações de fidelidade removidas: ${deletedLoyaltyTx.count}`);

  const deletedFiscalDocs = await prisma.fiscalDocument.deleteMany({ where: { order: { unitId: unit.id } } });
  console.log(`  ✓ Documentos fiscais removidos: ${deletedFiscalDocs.count}`);

  const deletedPayments = await prisma.payment.deleteMany({ where: { order: { unitId: unit.id } } });
  console.log(`  ✓ Pagamentos removidos: ${deletedPayments.count}`);

  const deletedItems = await prisma.orderItem.deleteMany({ where: { order: { unitId: unit.id } } });
  console.log(`  ✓ Itens de pedidos removidos: ${deletedItems.count}`);

  const deletedOrders = await prisma.order.deleteMany({ where: { unitId: unit.id } });
  console.log(`  ✓ Pedidos removidos: ${deletedOrders.count}`);

  // ── 2. Limpar produtos e categorias ──────────────────────────────────────
  const deletedProducts = await prisma.product.deleteMany({ where: { unitId: unit.id } });
  console.log(`  ✓ Produtos removidos: ${deletedProducts.count}`);

  const deletedCategories = await prisma.category.deleteMany({ where: { unitId: unit.id } });
  console.log(`  ✓ Categorias removidas: ${deletedCategories.count}`);

  console.log("\n🌱 Cadastrando catálogo real...\n");

  // ── 3. Criar categorias ───────────────────────────────────────────────────
  const catIdBySlug: Record<string, string> = {};

  for (const cat of CATEGORIES) {
    const created = await prisma.category.create({ data: { ...cat, unitId: unit.id } });
    catIdBySlug[cat.slug] = created.id;
  }
  console.log(`  ✓ Categorias criadas: ${CATEGORIES.length}`);

  // ── 4. Criar produtos com estoque ─────────────────────────────────────────
  let productCount = 0;
  for (const prod of PRODUCTS) {
    const categoryId = catIdBySlug[prod.categorySlug];
    if (!categoryId) {
      console.warn(`  ⚠ Categoria não encontrada para: ${prod.name}`);
      continue;
    }

    const { categorySlug, ...productData } = prod;
    void categorySlug;

    const created = await prisma.product.create({
      data: {
        ...productData,
        brandId: brand.id,
        unitId: unit.id,
        categoryId,
        frozen: true,
      },
    });

    await prisma.stockItem.create({
      data: {
        productId: created.id,
        quantity: 0,
        minQuantity: 5,
      },
    });

    productCount++;
  }

  console.log(`  ✓ Produtos criados: ${productCount}`);
  console.log("\n🎉 Catálogo real cadastrado com sucesso!");
  console.log("\n📋 Resumo por categoria:");

  for (const cat of CATEGORIES) {
    const count = PRODUCTS.filter((p) => p.categorySlug === cat.slug).length;
    console.log(`   ${cat.name}: ${count} produto(s)`);
  }

  console.log("\n💡 Dica: acesse /admin/produtos para adicionar fotos aos produtos.");
}

main()
  .catch((err) => {
    console.error("❌ Erro:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
