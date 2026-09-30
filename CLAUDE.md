@AGENTS.md

# Banguelas ERP — Diretrizes do Projeto

Sistema integrado de **cardápio online + ERP** para a **Banguelas Papinhas e Nutrição Infantil** — alimentação infantil saudável e congelada.

---

## Stack e Versões

| Tecnologia | Versão | Notas importantes |
|------------|--------|-------------------|
| Next.js | 16.2.9 | App Router, Turbopack. Leia `node_modules/next/dist/docs/` antes de qualquer código |
| React | 19.2.4 | — |
| TypeScript | 5 | `noImplicitAny: false` necessário por causa do Prisma 7 |
| Tailwind CSS | 4 | CSS custom properties, sem `tailwind.config.js` |
| Prisma | 7 | **Breaking changes** — ver seção abaixo |
| PostgreSQL | 16 | Via Docker em dev, VPS em produção |
| next-auth | 4 | Dois CredentialsProviders: `credentials` (admin) e `customer-credentials`; JWT strategy |
| Zod | 4 | Usa `.issues` (não `.errors` como v3) |
| Zustand | 5 | Carrinho persistido em localStorage |
| Recharts | 3 | Gráficos no dashboard e relatórios — componentes exigem `"use client"` |
| Sharp | 0.35 | Processamento de imagens no upload (resize + WebP) |

---

## Prisma 7 — Pontos Críticos

- **Client gerado em** `src/generated/prisma/client` — nunca `@prisma/client`
- **Sem `url =`** no `datasource db` do schema — a URL vai no `prisma.config.ts`
- **Adapter obrigatório** — `@prisma/adapter-pg` + `pg` para qualquer conexão direta
- **`noImplicitAny: false`** no `tsconfig.json` — arquivos gerados têm `// @ts-nocheck`
- Para executar seed: `npx tsx prisma/seed.ts` (não ts-node)
- **Sempre rodar `npx prisma generate` após mudar o schema** — apagar `.next/` e reiniciar o servidor dev; sem isso o Next.js usa chunks em cache com o client antigo e todas as rotas que usam os novos modelos retornam 500
- **Nunca usar `$queryRaw`** para queries que retornam `COUNT(*)` — PostgreSQL retorna `bigint` que não serializa para JSON. Usar `findMany` + agrupamento no servidor.
- **`WhatsAppSession` e outros modelos novos** — acessar via `(prisma.whatsAppSession as any)` por causa do `// @ts-nocheck` no client gerado

```typescript
// src/lib/prisma.ts — padrão correto para Prisma 7
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new (PrismaClient as any)({ adapter });
```

---

## Next.js 16 — Breaking Changes Relevantes

- **`params` em rotas dinâmicas é `Promise`** — sempre usar `await params`:
  ```typescript
  export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
  }
  ```
- **`searchParams` em Server Components também é `Promise`** — idem.
- **`images: { unoptimized: true }`** configurado em `next.config.ts` — `<Image>` renderiza como `<img>` direto sem passar pelo otimizador interno (`/_next/image`). Necessário porque o otimizador buscava arquivos internamente no Next.js (porta 3000), que não enxerga uploads novos sem restart. As imagens já chegam otimizadas (WebP via Sharp no upload).

---

## Multi-unidade (matriz + franquias)

Uma instalação e um banco atendem todas as unidades. `Unit` (`HQ` | `FRANCHISE`, com `slug`) é o tenant.

- **Toda tabela de negócio tem `unitId` obrigatório**: User, Customer, Category, Product, DeliveryZone, Coupon, Order, ThematicMenu, BannerSlide, WhatsAppSession. O catálogo é **por unidade** (a franquia recebe uma cópia do catálogo da matriz); estoque continua 1:1 com o produto.
- **Unicidades são compostas por unidade**: `[unitId, phone]`, `[unitId, cpf]`, `[unitId, sku]`, `[unitId, slug]` (categoria), `[unitId, code]` (cupom), `[unitId, number]` (pedido). Nunca usar `findUnique({ where: { phone } })`.
- **A unidade vem do host** (`src/proxy.ts` → header `x-unit-slug`, sempre sobrescrito): `cidade.banguelas.com.br` → `cidade`; `cardapio.*`, `www.*` e `localhost` → `matriz`. Em dev use `cidade.localhost:3000`. Ler com `getCurrentUnit()` (`src/lib/unit.ts`).
- **TODA rota nova deve escopar por unidade.** O client Prisma é `any`, então o TypeScript **não avisa** de query sem `unitId`. Helpers em `src/lib/api-auth.ts`:
  - `requireStaff(roles?)` — painel: exige SUPER_ADMIN/ADMIN/STAFF **da unidade do host** (SUPER_ADMIN acessa qualquer uma). Retorna `{ unit }` ou `NextResponse` (401/403).
  - `resolveUnit()` — rotas públicas (cardápio, checkout).
  - `requireStaffOrAgent()` — só para leitura do print-agent (Bearer por unidade).
  - `whatsappAuthOk()` / `resolveUnitBySlugParam()` — bot n8n (`?unit=slug`, padrão `matriz`). Sem `WHATSAPP_API_KEY` só é aceito fora de produção.
  - Nunca repassar o body cru ao Prisma: remover `id`, `unitId`, `brandId`.
  - Update/delete: `where: { id, unitId: unit.id }`.
- **Marca e regras de fidelidade são da rede**: qualquer unidade lê, só a matriz (`unit.type === "HQ"`) edita. **Módulo Escola/NFS-e é exclusivo da matriz.**
- **Pedido**: criar SEMPRE por `createOrder()` (`src/lib/order-service.ts`). Ele valida posse (cliente/endereço/zona/produto/cupom da unidade), preço do servidor, cupom (regras + uso atômico), estoque (baixa atômica, sem negativo), lock consultivo por unidade para o número sequencial, fidelidade e evento SSE. Tudo numa transação.
- **Checkout público**: `POST /api/checkout` (cliente + endereço + pedido numa chamada). `POST /api/pedidos` é só do painel.
- **SSE** (`/api/admin/events`) entrega só eventos da unidade do painel (`AdminEvent.unitId`).
- **Sessão de cliente** (`getCustomerSession`) só vale na unidade do JWT (`session.user.unitId`).
- **print-agent**: `PRINT_AGENT_KEY` = HMAC(`PRINT_AGENT_SECRET`, slug). Gerar com `npx tsx scripts/print-agent-key.ts <slug>`.
- **Scripts**: `prisma/backfill-unit.ts` associa dados existentes à matriz (rodar entre os dois passos de `db push` ao migrar um banco antigo). `prisma/reset-catalog.ts [slug]` só apaga a unidade informada (padrão matriz).

- **Login Google (só clientes)**: o callback do OAuth só existe no `AUTH_HOST` (`NEXTAUTH_URL`). Fluxo: `/api/minha-conta/google/start` (na unidade, redireciona ao `AUTH_HOST` levando o slug; no `AUTH_HOST` grava o cookie `bg_login` {unit, returnTo}) → `/minha-conta/login/google` (`signIn("google")`) → callback → `jwt` acha o cliente por `googleId` ou e-mail verificado **na unidade do cookie** → `/api/minha-conta/google/finish` devolve à origem da unidade (destino montado no servidor; `returnTo` só aceita caminho interno). Cliente novo fica com sessão `CUSTOMER_PENDING` até `/minha-conta/completar-cadastro` (telefone): o `update()` só promove se o cliente existir na mesma unidade com o **mesmo googleId** do token. Telefone de conta com senha/Google nunca é "assumido". Em produção `COOKIE_DOMAIN=.banguelas.com.br` compartilha a sessão entre subdomínios; sem ela, cada host tem sua sessão.
- **URIs no Google Cloud**: redirect `https://<AUTH_HOST>/api/auth/callback/google` (+ `http://localhost:3000/api/auth/callback/google` em dev).

- **Dados internos do produto** (`barcode`, `ncm`, `packWeightG`, `packLengthCm/WidthCm/HeightCm` — `src/lib/product-fields.ts`): **nunca no público.** Toda consulta pública de produto usa `omit: PUBLIC_PRODUCT_OMIT` (API `/api/produtos` sem login, página `/cardapio` — que serializa o produto inteiro para o navegador — e o cardápio temático). Ao criar nova consulta pública de `Product`, incluir o `omit`. POST/PUT validam com `parseInternalFields` (EAN/GTIN com dígito verificador, NCM de 8 dígitos). `weight` (antigo) é o peso do conteúdo; `packWeightG` é o da embalagem.

Variáveis: `BASE_DOMAIN`, `AUTH_HOST`, `COOKIE_DOMAIN` (prod, `.banguelas.com.br`), `PRINT_AGENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

---

## Revendedores, preço de revenda e pedido manual

**REGRA DE SIGILO (inegociável): o preço de revenda (`Product.resalePrice`) só pode chegar ao navegador de um REVENDEDOR cadastrado e logado. Nunca a outro cliente, visitante, WhatsApp ou API pública.**

- **Quem é revendedor**: `Customer.type = RESELLER`. **Só ADMIN cadastra** (`POST /api/clientes` com `type`) ou muda o tipo (`PUT`), e só ADMIN define/redefine a senha (`POST /api/clientes/[id]/senha`; a senha provisória é mostrada UMA vez). O revendedor **não se cadastra sozinho**: `register`, Google (`completar`) e checkout de visitante recusam qualquer conta que não seja `RETAIL` (mesma mensagem de "conta existente", para não revelar quem é revendedor).
- **Nível de preço é decidido no servidor** por `getSessionPricing()` (`src/lib/pricing.ts`): sessão de cliente da unidade + `Customer.type` lido **do banco a cada request** (revogar vale na hora). Nunca de body, query, cookie ou header.
- **Como o preço sai**: `resalePrice` está em `INTERNAL_PRODUCT_FIELDS` → **toda consulta pública de produto usa `omit: productOmitFor(tier)`** e passa por `applyTierPricing()`, que converte para `price` (revenda, ou o normal se o produto não tiver) e **remove** `resalePrice`/`priceOriginal`. Vale para `/api/produtos`, `/cardapio` (props serializadas no HTML), cardápio temático. WhatsApp é sempre varejo. Ao criar nova consulta pública de `Product`, incluir o omit.
- **Cobrança**: `createOrder({ pricing })` — o storefront passa o nível da sessão; `BY_CUSTOMER` só no painel (pedido manual segue o tipo do cliente escolhido); `RESELLER` exige cliente `RESELLER`. Revenda: sem cupom, sem pontos de fidelidade.
- **Faturado** (`paymentMethod: "INVOICE"`, só cliente não-varejo): prazo escolhido **por pedido**, contado da data do pedido. Loja: `RESELLER_INVOICE_DAYS` (7/14/21/28, `src/lib/invoice-terms.ts`); pedido manual: 1–120. Gera `FinancialEntry` RECEIVABLE (`source: ORDER`, `sourceKey: order:<id>`). Entregar **não** marca como pago; baixar a conta a receber atualiza o `Payment`; cancelar o pedido cancela a conta a receber. Total 0 (100% de desconto) não gera conta e nasce quitado.
- **Pedido manual** (`/admin/pedidos/novo`, `POST /api/pedidos`, qualquer staff): cliente existente ou novo, desconto em % (≤ 100) ou valor sobre o **pedido inteiro (itens + frete)** — não acumula com cupom —, já **entra em produção** (`initialStatus`), `createdBy` e `discountNote` gravados, opção "já recebido".
- **Carrinho** (localStorage): `syncPrices` realinha os preços a cada carga do cardápio e o carrinho é limpo ao sair — preços de revenda não ficam no navegador do próximo usuário. O servidor sempre recalcula.
- `passwordHash` nunca vai em respostas (`omit`).
- Testes que valem repetir ao mexer aqui: varrer `/api/produtos`, `/cardapio`, `/api/whatsapp/cardapio`, `/minha-conta/*` como visitante e cliente comum (com headers/cookies forjados) procurando o valor e `resalePrice`.

---

## Franquias (gestão da rede)

`/admin/franquias` — **só administrador da MATRIZ** (`requireHQAdmin`; a franquia recebe 403). Uma franquia é uma `Unit` `FRANCHISE`. **Cadastrar franqueado** (`POST /api/franquias`, também via Clientes → Novo → Franqueado) cria de uma vez, numa transação: a unidade (**link de acesso** = `slug`, em `slug.BASE_DOMAIN`), o franqueado como `Customer` `FRANCHISEE` da matriz (`franchiseUnitId`), os **usuários do painel da franquia** (ADMIN/STAFF, senha provisória exibida UMA vez; login em `slug.dominio/admin/login`) e — opcional — a cópia do catálogo. Se qualquer dado conflitar (link, e-mail, telefone, CPF/CNPJ) nada fica criado.

- **Link**: slug validado (`isValidSlug`) e não pode ser reservado (`RESERVED_SLUGS`: www, cardapio, admin, api, matriz…); não muda depois. Desativar a franquia derruba o link na hora (`clearUnitCache`); nada é apagado.
- **Usuários** (`/api/franquias/[id]/usuarios`): criar, redefinir senha, ativar/desativar, mudar perfil — só pela matriz. A franquia **nunca fica sem administrador ativo**. `User.email` é único na rede.
- **Catálogo** (`src/lib/catalog-sync.ts`): a franquia tem a sua **cópia** (`Product/Category` com `unitId` próprio, ligada por `sourceProductId`/`sourceCategoryId`). `syncCatalogToUnit` cria o que falta e atualiza conteúdo (nome, descrição, ingredientes, categoria, fotos, combos), **sem tocar** em estoque (nasce zerado), preço de revenda, nem preço personalizado (`priceCustom`). Matriz desativa → franquia desativa (reativar é da franquia). Dispara **sozinho** (`scheduleCatalogSync`, agrupa 2,5 s) após qualquer alteração de produto/categoria/combo/foto NA MATRIZ — toda rota nova que altere o catálogo da matriz deve chamá-lo — e manualmente em Gerenciar → Sincronizar.
- **Na franquia**: produto/combo copiado da rede só aceita **preço**, ativo e destaque (o resto vem da matriz e seria sobrescrito); mudar o preço marca `priceCustom`. Produtos criados localmente (sem `sourceProductId`) são livres. Estoque, pedidos, clientes, financeiro, entregadores e zonas são da franquia.
- **Visibilidade no menu**: Franquias e Escola/NFS-e só na matriz (`hqOnly`).

---

## Combos personalizados

Combo = `Product` com `kind: COMBO`: **preço fixo**, **quantidade EXATA** (`comboSize`, ex.: 20) e uma lista de produtos do cardápio (`ComboItem`, com `maxQty` opcional por produto). O cliente distribui a quantidade entre os produtos; sem limite indicado, vale qualquer quantidade até completar o total. Cadastro em `/admin/combos` (qualquer staff).

- **Regras** em `src/lib/combo.ts` (módulo puro, usado pelo servidor e pelo construtor da loja): `validatePicks` (soma exata, limite por produto, sem estoque, produto de fora), `isComboAvailable`, `validateComboDefinition` (os limites precisam permitir fechar a quantidade). Teste: `npx tsx scripts/test-combo.ts`.
- **Pedido** (`createOrder`): item de combo traz `combo: [{productId, quantity}]` (por unidade do combo). Cada combo é linha própria (não funde). Preço = `Product.price` do combo — **sem preço de revenda** (revendedor paga o preço do combo; `applyTierPricing` e o PUT de produto ignoram `resalePrice` em combo). O que foi escolhido fica em `OrderItemComponent` (já multiplicado pela quantidade da linha).
- **Estoque**: baixa dos produtos INDIVIDUAIS, **somando tudo que o pedido consome por produto** (avulsos + componentes de todos os combos) numa checagem atômica; combo não tem `StockItem`. Sem estoque suficiente → 409 e o pedido inteiro é desfeito.
- **Cardápio**: produtos COMBO recebem `combo: { size, available, options[] }` (`src/lib/combo-data.ts`) só com nome, limite, estoque e foto — **nenhum preço de componente**. Produto sem estoque aparece apagado com "sem estoque"; combo sem como ser montado fica "esgotado". WhatsApp não vende combo (fora do cardápio do bot; pedido é recusado).
- **Carrinho**: cada combo montado é uma linha (`lineId`, `combo`, `comboSummary`, quantidade fixa 1). Funções de produto simples ignoram linhas de combo.
- **Produção/expedição**: a cozinha prepara os **componentes**, não "o combo" — lista consolidada do kanban, romaneio, tela do pedido, impressora térmica e histórico do cliente mostram a composição. Ao criar telas que listem itens de pedido, incluir `components`.
- **Cancelar pedido devolve o estoque** (avulsos + componentes de combo) na mesma transação (`restoreOrderStock`), registra movimentação IN "Cancelamento do pedido #N", cancela o pagamento pendente e a conta a receber do faturado. A troca de status é reivindicada atomicamente: cancelamentos simultâneos devolvem uma vez. Pedido entregue não cancela; cancelado não reabre.

---

## Entregadores

Cadastro em `/admin/entregadores` (abas Relatório e Cadastro) — **só ADMIN**; o entregador **não acessa o sistema**. STAFF apenas escolhe o entregador no pedido (`GET /api/entregadores` sem PIX/CPF).

- **Pagamento**: por entrega, valor por **região** em `DeliveryZone.courierFee` (só ADMIN define; o custo já está dentro da taxa cobrada do cliente). Ao escolher o entregador o valor é **copiado para `Order.courierFee`** (snapshot: reajustar a zona depois não muda entregas passadas; trocar de entregador mantém o valor original).
- **Regra do servidor** (`PATCH /api/pedidos/[id]`, `createOrder`): pedido de **ENTREGA** não vai para `IN_PRODUCTION`/`READY`/`DISPATCHED`/`DELIVERED` sem entregador → 409 `code: "COURIER_REQUIRED"`. Retirada não usa (400 se informar). Pedido manual de entrega exige `courierId`. Não troca entregador de pedido entregue/cancelado. UI: `useOrderStatus` (`CourierPicker.tsx`) abre o seletor sozinho ao receber o `COURIER_REQUIRED` — usado na lista de pedidos, kanban de produção e página do pedido. Toda nova tela que mude status deve usá-lo.
- **Relatório**: entregas **ENTREGUES** por dia da entrega em **horário de Brasília** (`brDate`/`brRange` em `src/lib/courier.ts`; a coluna é `timestamp` sem fuso, guarda UTC). Sem dados do cliente (só bairro) — o relatório imprimível (`/api/entregadores/[id]/relatorio`) é entregue ao entregador. Mostra taxa cobrada × custo.
- **Financeiro diário**: `syncCourierPayables` fecha os dias **já encerrados**: uma conta a pagar por (entregador, dia) — `source COURIER`, `sourceKey courier:<id>:<dia>`, centro de custo "Entregadores", vencimento no dia. Dia corrente entra na virada. Idempotente, sob demanda (financeiro/relatório, no máx. a cada 30 s/unidade), **sem cron**, janela de 90 dias. Conta ABERTA é recalculada/removida se as entregas mudarem; **PAGA ou CANCELADA nunca é tocada**; valor/vencimento não são editáveis (vêm da origem); não exclui (cancela).
- **SIGILO**: `courierFee`/`courierId`/`createdBy`/`discountNote` são internos. Zonas públicas e `/api/cep` usam `omit: { courierFee: true }`; `/api/zonas-entrega?todas=true` (painel) só devolve o custo a ADMIN; histórico do cliente e resposta do checkout removem os campos do pedido. Ao criar rota pública que devolva zona ou pedido, aplicar o `omit`.

---

## Financeiro (contas a pagar / a receber)

Tela `/admin/financeiro` (abas: Resumo, A pagar, A receber, Recorrentes, Fornecedores, Centros de custo). **Só ADMIN/SUPER_ADMIN** (`requireStaff(["SUPER_ADMIN","ADMIN"])` nas APIs e guarda no servidor na página); STAFF não vê. Tudo por unidade.

- **Modelos**: `FinancialEntry` (a pagar e a receber num só: `type` PAYABLE|RECEIVABLE; `status` OPEN|PAID|CANCELLED; "vencido" é calculado = OPEN com `dueDate` < hoje), `RecurringEntry` (modelo da recorrência), `Supplier`, `CostCenter`. `FinancialEntry.source` (MANUAL|RECURRING|ORDER|COURIER) + `sourceKey` (único por unidade) tornam a geração automática idempotente — usar para os repasses de entregador e pedidos faturados.
- **Datas** são "só data" (`@db.Date`), aritmética **em UTC** (`src/lib/financeiro.ts`), e "hoje" é o dia em **America/Sao_Paulo** (`BUSINESS_TZ`), não o do servidor. Filtros de período de pedidos usam `-03:00`.
- **Recorrência**: `every` + `period` (DAY|WEEK|MONTH|YEAR) — a UI expõe Semanal/Mensal/Anual/Personalizada (a cada N…). Cada cobrança é calculada a partir da data inicial (dia 31 mensal → último dia dos meses curtos, sem "grudar" no 28). `materializeRecurring(unitId)` gera até hoje + 60 dias, é idempotente (`@@unique([recurringId, dueDate])`) e roda em toda consulta de lançamentos/resumo — **não há cron**.
- **Editar recorrência**: mudar valor/descrição/vínculos atualiza as cobranças em aberto de hoje em diante (sobrescreve edição individual); mudar frequência/datas ou pausar remove só as **estritamente futuras** em aberto e regenera. Pagas, vencidas e a que vence hoje não são tocadas.
- **Regras**: lançamento pago fica travado (reabrir para editar); ocorrência de recorrência e lançamentos automáticos **não se excluem** (recriaria) — cancelar; só MANUAL não pago pode ser excluído. Fornecedor/centro de custo com histórico são desativados em vez de excluídos. Parcelamento: `amount` é o total, dividido igualmente com a última parcela absorvendo os centavos.
- **Pendente**: visão consolidada da matriz (todas as unidades) virá com o dashboard das franquias; integrar repasse de entregadores (item 4) e faturamento de revendedores (item 6) via `source`/`sourceKey`.

---

## Rede de franquias: reposição, avisos, premiações e dashboard

- **Reposição** (`/admin/reposicao`, só ADMIN de franquia; `/api/reposicao/*`): a franquia pede produtos à matriz. O pedido nasce **na matriz** (`unitId` da matriz) em nome do franqueado (`Customer FRANCHISEE.franchiseUnitId`), com `priceTier FRANCHISE`: preço `franchisePrice → resalePrice → price` (**franchisePrice é sigiloso**: está em `INTERNAL_PRODUCT_FIELDS` e nunca é copiado para a franquia nem devolvido em rota pública), sem cupom, sem pontos, sem combo. Pagamento faturado (7/14/21/28 dias → conta a receber na matriz) ou PIX. A matriz atende pelo fluxo normal (lista tem filtro/etiqueta "Reposição"). **Ao marcar ENTREGUE**, `receiveReplenishment` dá entrada no estoque da franquia (mapeia por `sourceProductId`; sincroniza o catálogo se o produto ainda não existir lá); idempotente via `Order.restockedAt` reivindicado na mesma transação; cancelar antes de entregar só devolve o estoque da matriz. Também há histórico, "repetir pedido", lançamentos (produtos da matriz com menos de 45 dias) e "mais pedidos pelas outras franquias" (só produto e nº de franquias — **nunca identifica a franquia**).
- **Avisos** (`/admin/avisos` na matriz; `Announcement`): `POPUP` abre ao entrar no painel da franquia (uma vez **por usuário**, até "Entendi") e `NOTICE` fica no sino (`AnnouncementsHost`, montado em `layout.tsx` só para franquias). Para todas as franquias ou só as escolhidas; janela de datas; "lido por X de Y". `/api/meus-avisos` devolve só o que a unidade pode ver.
- **Premiações** (`/admin/premiacoes`; `Award`/`AwardGrant`): meta por **nº de pedidos** ou **faturamento**, janela opcional, prêmio em texto. Conta pedidos da franquia **não cancelados**; a conquista é registrada uma vez por (premiação, franquia) no instante em que a meta foi cruzada (`computeProgress`, teste: `npx tsx scripts/test-awards.ts`) e gera **pop-up de parabéns** só para aquela franquia. Avaliada a cada pedido da franquia (`createOrder`, sem atrasar o pedido), ao criar/editar a premiação e em "Reavaliar agora". Editar a meta ou cancelar pedidos **não revoga**. A matriz marca "prêmio entregue". A franquia só vê o próprio progresso.
- **Dashboard da rede** (`/admin/rede`, só admin da matriz; `/api/rede/dashboard`): por unidade, no período e comparado ao anterior de mesmo tamanho — vendas, pedidos, ticket, cancelamento, clientes novos, estoque baixo, financeiro em aberto/vencido e série diária. **Venda = pedido de consumidor não cancelado; a reposição (`priceTier FRANCHISE`) fica à parte** e não conta como venda da matriz nem da franquia.

---

## Ambiente de demonstração (navegar por tudo sem tocar em produção)

`prisma/demo.ts` popula um banco **local de teste** com dados de todas as funcionalidades (revendedor, combo, entregadores com relatório, financeiro, pedido cancelado, franquia "Ribeirão Preto" com usuários). **Recusa rodar** se `DATABASE_URL` não for local com nome contendo demo/dev/test.

```bash
docker exec erp-dev-db psql -U postgres -c "create database erp_demo"      # container postgres local de teste (porta 5433)
export DATABASE_URL=postgresql://postgres:dev@localhost:5433/erp_demo
npx prisma db push && npx tsx prisma/seed.ts && npx tsx prisma/demo.ts      # imprime os logins (senha demo1234)
npx next build
env DATABASE_URL=$DATABASE_URL NEXTAUTH_URL=http://localhost:3000 NEXTAUTH_SECRET=demo BASE_DOMAIN= AUTH_HOST= COOKIE_DOMAIN= npx next start -H 127.0.0.1 -p 3000
```
Acesso de fora: túnel SSH `ssh -L 3000:127.0.0.1:3000 usuario@servidor` e abrir `http://localhost:3000` (matriz) e `http://ribeirao.localhost:3000` (franquia; Chrome/Edge/Firefox resolvem `*.localhost`). As variáveis `BASE_DOMAIN`/`AUTH_HOST`/`COOKIE_DOMAIN` ficam vazias no demo (localhost).

---

## Segunda etapa — em produção desde 2026-09-30

A "segunda etapa" (branch `feat/planejamento`, mergeada na `main` no commit `b3ad880`) entrou em produção em 2026-09-30. Antes dela a produção rodava o commit `d41e18c` (loja + ERP de UMA unidade). Tudo abaixo foi implementado e está no ar:

- **Multi-unidade** (matriz + franquias, um banco só) e links por cidade (`cidade.banguelas.com.br`).
- **Login Google** no domínio principal com retorno seguro.
- **Combos personalizados**, **pedido manual** com desconto, **financeiro** (a pagar/receber, recorrência, fornecedores, centros de custo), **entregadores** (pagos por entrega, relatório, conta a pagar diária), **campos internos do produto** (código de barras, NCM, peso/dimensões), **revendedores** (preço de revenda sigiloso, faturamento por pedido), **filtro por período** nos pedidos e **cancelamento devolvendo estoque**.
- **Franquias**: cadastro do franqueado com link e usuários, dashboard da rede, reposição (pedidos à matriz, histórico, repetir, lançamentos, mais pedidos), avisos/pop-ups, premiações, sincronização de catálogo e preço próprio.
- Detalhes de cada módulo estão nas seções acima (Multi-unidade, Revendedores, Franquias, Combos, Entregadores, Financeiro, Rede).
- **Pendente da etapa**: verificação de assinatura do webhook InfinityPay (a posteriori); teste dos pop-ups em navegador real; DNS curinga + certificado para as franquias; integração com InfinityPay em produção.

### Migração do banco de produção (2026-09-30)
O banco antigo não tinha `unitId`. Aplicada em 3 passos, numa única transação, com o app parado (scripts em `docs/migracao-multiunidade/`):
1. `1-adiciona-estrutura.sql` — tabelas/colunas novas, `unitId` ainda opcional.
2. `2-preenche-dados.sql` — cria a unidade `matriz` (HQ) e associa TODOS os dados existentes; aborta se sobrar linha sem unidade.
3. `3-torna-obrigatorio.sql` — `unitId` obrigatório + uniques compostos por unidade.
Foi ensaiada antes numa cópia restaurada do backup (resultado: schema idêntico ao final, 93 produtos/12 clientes/1 usuário/1 zona preservados). **Não use `prisma db push` para migrar um banco antigo**: ele pediria para apagar dados.
**Atenção**: o `CMD` do Dockerfile roda `npx prisma db push && npm start`. Se o schema mudar de forma destrutiva, o deploy pode falhar ou pedir confirmação — migre o banco à mão antes de subir.
**Rollback**: restaurar o dump `producao-pre-go-20260930-190159.dump` e redeployar o commit `d41e18c`.

---

## Acessos e infraestrutura de produção

> **Nenhuma senha, token ou chave é registrada aqui** (este arquivo vai para o Git). Valores ficam no Coolify (variáveis do app), no gerenciador de senhas do dono e nos arquivos de backup protegidos do servidor. Se perder um segredo, gere outro e troque.

**Servidor** (VPS, Linux; o mesmo hospeda outros apps: Supabase, n8n, Evolution API, cartório). Tudo sob Coolify 4.1.2 + Traefik (portas 80/443).

| O quê | Onde / como |
|---|---|
| Site (loja + admin) | `https://cardapio.banguelas.com.br` (matriz). Painel: `/admin/login`; cliente: `/minha-conta/login` |
| Franquias | `https://<slug>.banguelas.com.br` — **ainda não há DNS curinga** `*.banguelas.com.br`; adicionar cada domínio no Coolify ou criar o curinga + certificado |
| Coolify (painel) | `http://<IP-do-servidor>:8000` → app **ERP Banguelas** (uuid `hmi9i2v07jvsk541083ib516`, repo `henrikeev-web/erp`, branch `main`, Dockerfile) |
| Deploy | **Manual** (o push na `main` NÃO dispara sozinho): botão Deploy no Coolify, ou API `GET /api/v1/deploy?uuid=<uuid>` com token |
| API do Coolify | `http://127.0.0.1:8000/api/v1` (token criado em Keys & Tokens → API Tokens, com `read/write/deploy`; **apague ao terminar**). Gotcha: `/envs` dá 500 se alguma variável estiver gravada sem criptografia no banco do Coolify (já corrigido em 2026-09-30) |
| Container do app | `hmi9i2v07jvsk541083ib516-<id>` (muda a cada deploy); logs: `docker logs -f $(docker ps --format '{{.Names}}' \| grep hmi9i)` |
| Banco de produção | container `el1sceqzhimndmzyxanlb2l7` (postgres:16-alpine), usuário `erp`, banco `banguelas_erp`, sem porta pública. Acesso: `docker exec -it el1sceqzhimndmzyxanlb2l7 psql -U erp -d banguelas_erp`. A senha está na `DATABASE_URL` do app no Coolify |
| Banco do Coolify | container `coolify-db` (postgres:15), usuário `coolify`, banco `coolify` (variáveis de ambiente ficam criptografadas com a APP_KEY; **nunca gravar valor em texto puro** nessa tabela) |
| Repositório | `git@github-banguelas:henrikeev-web/erp.git` — acesso por **deploy key com escrita** (host alias `github-banguelas` em `~/.ssh/config`) |
| Google OAuth | Cliente OAuth Web (ID `232141257826-99aoginjuk82fvc2ktdnubhv8ugk0o37.apps.googleusercontent.com`). URI de redirecionamento: `https://cardapio.banguelas.com.br/api/auth/callback/google` (+ `http://localhost:3000/api/auth/callback/google` em dev). O secret só existe no Coolify e no `.env` local |
| Ambiente de teste local | container `erp-dev-db` (porta 5433, usuário `postgres`, senha `dev`), bancos `erp_dev`, `erp_demo` (demo) e `erp_prodcopy` (cópia do ensaio da migração; pode apagar). Só local |

**Variáveis de ambiente do app em produção (Coolify → ERP Banguelas → Environment Variables)**, todas *runtime* (sem *buildtime*, exceto as três `NEXTAUTH_*`/`NIXPACKS_*` que já existiam):
`DATABASE_URL`, `NEXTAUTH_URL` (`https://cardapio.banguelas.com.br`), `NEXTAUTH_SECRET`, `BASE_DOMAIN` (`banguelas.com.br`), `AUTH_HOST` (`cardapio.banguelas.com.br`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `WHATSAPP_API_KEY`, `PRINT_AGENT_SECRET`, `NIXPACKS_NODE_VERSION`. Variável nova só vale depois de novo deploy. O Coolify cria cópias "preview" de cada variável (não usadas). **Ainda não definidas**: `COOKIE_DOMAIN` (`.banguelas.com.br`, só quando houver franquias com sessão compartilhada), `INFINITEPAY_HANDLE`, `WAREHOUSE_LAT/LNG`, `NFSE_CERT_*` (conferir se o app de produção já as tinha antes de mexer).

**Usuários do painel (produção)**
| Usuário | Perfil | Unidade | Observação |
|---|---|---|---|
| `admin@banguelas.com.br` | ADMIN | matriz | Usuário do seed. **Verificar se a senha ainda é a padrão do seed (`admin123`) e trocar** |
| `everton@banguelas.com.br` | ADMIN | matriz (franqueadora) | Criado em 2026-09-30 com senha aleatória de 14 caracteres entregue ao dono uma vez; **trocar no 1º acesso** (ainda não há tela de troca de senha: redefinir via banco com hash bcrypt custo 10) |
| Franqueados | ADMIN/STAFF | cada franquia | Criados em `/admin/franquias` (senha provisória mostrada uma vez); login em `<slug>.banguelas.com.br/admin/login` |

Criar usuário direto no banco (emergência): gerar senha e hash com `bcryptjs` (custo 10) e `INSERT INTO "User" (id,"unitId",name,email,"passwordHash",role,active,"createdAt","updatedAt")` com `unitId` da unidade desejada (`select id from "Unit" where slug='matriz'`). Use `docker exec -i` (com `-i`) ao passar SQL por stdin.

**Backups (no servidor, `/root/backups/`, modo 600)**: `producao-antes-da-migracao-20260930-172603.dump` e `producao-pre-go-20260930-190159.dump` (banco de produção antes da migração, formato `pg_dump -Fc`; restaurar com `pg_restore`), `coolify-envvars-antes.sql` (tabela de variáveis do Coolify antes da correção). Não há backup automático agendado — **criar rotina** (Coolify → banco → Backups).

**Integrações externas**
- **WhatsApp/n8n**: endpoints `/api/whatsapp/*` com `Authorization: Bearer <WHATSAPP_API_KEY>`; `?unit=<slug>` (padrão `matriz`). Em produção, sem a chave o acesso é recusado — **o fluxo do n8n precisa usar a chave nova**.
- **print-agent**: chave por unidade = HMAC(`PRINT_AGENT_SECRET`, slug); gerar com `npx tsx scripts/print-agent-key.ts <slug>`.
- **InfinityPay**: handle em `INFINITEPAY_HANDLE`; webhook `/api/pagamentos/webhook` (verificação de assinatura pendente).

---

## Infraestrutura Docker (desenvolvimento local)

O projeto roda inteiramente em Docker. Três containers definidos em `docker-compose.yml`:

| Container | Imagem | Porta | Função |
|-----------|--------|-------|--------|
| `banguelas-nginx` | nginx:alpine | **80** | Proxy reverso; serve `/uploads/` direto do disco |
| `banguelas-app` | delivery-erp-app | 3000 (interno) | Next.js produção |
| `banguelas-db` | postgres:16-alpine | 5432 | Banco de dados |

**Acesso:** `http://localhost` (porta 80) — nunca acessar porta 3000 diretamente.  
**Por quê:** Next.js em produção só enxerga arquivos de `public/` que existiam no startup. O Nginx serve `/uploads/` diretamente do disco, tornando uploads visíveis imediatamente sem restart.

**Uploads persistidos em pasta local** — `./public/uploads/` (bind mount, não named volume). Sobrevive a reinstalação do Docker.

**Acompanhar logs em tempo real:**
```bash
docker logs -f banguelas-app
```

---

## Setup de Desenvolvimento

### Após formatação / primeira vez

```bash
# 1. Subir todos os containers
docker compose up -d

# 2. Popular banco (somente se o volume postgres foi perdido)
docker exec banguelas-app npx tsx prisma/seed.ts
# Para restaurar o catálogo real de 93 produtos (substitui os fictícios do seed):
docker exec banguelas-app npx tsx prisma/reset-catalog.ts

# 3. Restaurar estoque após reset-catalog
# (o reset-catalog não cria StockItem — rodar via psql ou admin)
```

### Desenvolvimento local com hot-reload (requer Node.js 24 instalado)

```bash
# Node.js 24 LTS instalado em 2026-06-16 via winget
npm install
npm run dev
# → http://localhost:3000 (dev local direto, sem Nginx)
```

> Em dev local, o Next.js detecta arquivos novos em `public/` em tempo real. O Nginx só é necessário em produção (containers Docker).

### Credenciais padrão (seed)
- **Admin:** `admin@banguelas.com.br` / `admin123`
- **Cupom de exemplo:** `BEMVINDO10` (10% off, primeiro pedido)

### Dados fictícios (seed)
- 12 clientes com filhos, endereços e loyalty cards
- 20 pedidos em variados status (PENDING → DELIVERED) com pagamentos e pontos calculados

### Variáveis de ambiente (.env)
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/delivery_erp
NEXTAUTH_SECRET=sua-chave-secreta-aqui
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Banguelas

# Localização do CD — verificar coordenadas no Google Maps
WAREHOUSE_LAT=-20.8189
WAREHOUSE_LNG=-49.3750

# InfinityPay — InfiniteTag sem o "$"
INFINITEPAY_HANDLE=seu-handle-aqui

# Bearer token que o n8n envia nas chamadas WhatsApp
WHATSAPP_API_KEY=trocar-por-chave-segura

# NFS-e — apenas certificado no .env; dados fiscais configurados via /admin/escola → Configurações
NFSE_CERT_PATH=./certs/cert.pfx
NFSE_CERT_PASSWORD=
```

---

## Estrutura de Rotas

### Público (storefront)
| Rota | Descrição |
|------|-----------|
| `/cardapio` | Cardápio com filtros por faixa etária, busca, carrinho, checkout |
| `/minha-conta/login` | Login (telefone ou email + senha) e cadastro de cliente |

### Área do Cliente (protegida por next-auth, role `CUSTOMER`)
| Rota | Descrição |
|------|-----------|
| `/minha-conta` | Perfil: nome, email, telefone (readonly), badge de tier de fidelidade |
| `/minha-conta/enderecos` | CRUD de endereços salvos com busca por CEP (ViaCEP) |
| `/minha-conta/filhos` | CRUD de filhos com avatar colorido por faixa etária |
| `/minha-conta/pedidos` | Histórico de pedidos com itens expansíveis (últimos 50) |
| `/minha-conta/fidelidade` | Tier atual, configurações do programa, histórico de transações |
| `/minha-conta/notificacoes` | Preferências: WhatsApp, Email, Promos, Lembrete de Recompra |

### Admin (protegido por next-auth, role `ADMIN`)
| Rota | Descrição |
|------|-----------|
| `/admin/login` | Login com e-mail/senha |
| `/admin` | Dashboard: stats, gráfico de receita 7d, pedidos ativos, top produtos, status 30d |
| `/admin/pedidos` | Lista de pedidos com filtros, badge de pagamento pendente, SSE para auto-print |
| `/admin/pedidos/[id]` | Detalhe do pedido, avanço de status, romaneio |
| `/admin/clientes` | Lista de clientes com busca, filtro ativo/inativo |
| `/admin/clientes/[id]` | Perfil completo: filhos, fidelidade, histórico, edição |
| `/admin/produtos` | Catálogo de produtos com modal de edição completo (campos + fotos) |
| `/admin/categorias` | CRUD de categorias por faixa etária (criar, editar, ativar/desativar) |
| `/admin/estoque` | Controle de estoque com alertas de mínimo |
| `/admin/cupons` | CRUD completo de cupons promocionais |
| `/admin/follow-up` | CRM: clientes inativos + WhatsApp rápido |
| `/admin/fiscal` | Romaneios em lote por data/status |
| `/admin/producao` | Kanban de produção + lista consolidada de itens |
| `/admin/zonas` | CRUD de zonas de entrega — suporta raio por km **ou** bairros/cidades |
| `/admin/fidelidade` | Ranking de clientes (aba) + configurações do programa (aba) |
| `/admin/relatorios` | Relatórios financeiros e de desempenho (30d) com gráfico de receita 7d |
| `/admin/configuracoes` | Marca (nome, cor primária) + gerenciador de slides do banner (imagens desktop/mobile + link) |
| `/admin/escola` | Pais com mensalidade (aba) + Mensalidades por mês/ano com emissão NFS-e (aba) + Configurações fiscais GissOnline (aba) |

### API Routes — Área do Cliente
| Rota | Métodos | Descrição |
|------|---------|-----------|
| `/api/minha-conta/register` | POST | Cadastro de cliente; se phone existe sem senha → ativa conta; cria LoyaltyCard automaticamente |
| `/api/minha-conta/perfil` | GET, PUT | Ler e editar nome/email do cliente logado |
| `/api/minha-conta/enderecos` | GET, POST | Listar/criar endereços do cliente logado |
| `/api/minha-conta/enderecos/[id]` | PATCH, DELETE | Editar/excluir endereço; `params` é `Promise<{id}>` |
| `/api/minha-conta/filhos` | GET, POST | Listar/criar filhos |
| `/api/minha-conta/filhos/[id]` | PATCH, DELETE | Editar/excluir filho; `params` é `Promise<{id}>` |
| `/api/minha-conta/pedidos` | GET | Histórico de pedidos (últimos 50) com itens e produtos |
| `/api/minha-conta/notificacoes` | GET, PUT | Ler/salvar preferências de notificação |

### API Routes — Gerais
| Rota | Métodos | Descrição |
|------|---------|-----------|
| `/api/pedidos` | GET, POST | Listar/criar pedidos — POST decrementa estoque em `$transaction`; gera link InfinityPay se `ONLINE_PIX`/`ONLINE_CREDIT`; emite SSE `order_new` |
| `/api/pedidos/[id]` | GET, PATCH | Detalhe/atualizar status — PATCH emite SSE `order_confirmed` ou `order_status` |
| `/api/pedidos/[id]/romaneio` | GET | HTML do romaneio para impressão — já inclui `window.print()` no `onload` |
| `/api/pedidos/[id]/pagamento` | POST | Gera/reenvia link InfinityPay para um pedido existente |
| `/api/pagamentos/webhook` | POST | Webhook InfinityPay — confirma pagamento, avança status para CONFIRMED, emite SSE |
| `/api/admin/events` | GET | SSE stream para o painel admin — emite `order_new`, `order_confirmed`, `order_status`; `runtime = "nodejs"` |
| `/api/clientes` | GET, POST | Listar/criar clientes — POST cria LoyaltyCard automaticamente |
| `/api/clientes/[id]` | GET, PUT | Perfil completo/editar cliente |
| `/api/clientes/[id]/enderecos` | GET, POST | Endereços do cliente (acesso admin) |
| `/api/produtos` | GET, POST | Catálogo com filtros `brand`, `categoryId`, `ageMin/Max`; `?includeInactive=true` para o admin; retorna `stockItem.quantity` |
| `/api/produtos/[id]` | GET, PUT, DELETE | CRUD de produto — DELETE faz soft-delete (`active: false`) |
| `/api/produtos/[id]/imagens` | GET, POST | Listar/adicionar imagens; POST aceita `{ url, alt?, isMain? }` |
| `/api/produtos/[id]/imagens/[imgId]` | PATCH, DELETE | Atualizar (ex: `{ isMain: true }`) / excluir imagem — DELETE apaga arquivo de `public/uploads/` |
| `/api/upload` | POST | Upload para produtos (`multipart/form-data`, campo `file`); sharp → WebP 800×800 max; salva em `public/uploads/products/` |
| `/api/upload-banner` | POST | Upload para slides do banner; `?type=desktop` → 1400×480, `?type=mobile` → 800×600; salva em `public/uploads/banners/`; exige `runtime = "nodejs"` |
| `/api/cupons` | GET, POST | Listar/criar cupons |
| `/api/cupons/[id]` | PATCH, DELETE | Editar/excluir cupom |
| `/api/cupons/validar` | GET | Valida cupom `?code=X&total=Y` |
| `/api/categorias` | GET, POST | Lista/cria categorias; `?includeInactive=true` retorna todas |
| `/api/categorias/[id]` | PATCH, DELETE | Editar / soft-delete de categoria |
| `/api/zonas-entrega` | GET, POST | Listar/criar zonas |
| `/api/zonas-entrega/[id]` | PATCH, DELETE | Editar/excluir zona |
| `/api/cep` | GET | Lookup ViaCEP + match de zona `?cep=XXXXX` — prefere zona por raio km (Nominatim), fallback para bairro/cidade |
| `/api/dashboard` | GET | Dados do dashboard admin |
| `/api/estoque/[id]/movimentar` | POST | Movimentação de estoque (IN/OUT/ADJUSTMENT) |
| `/api/configuracoes` | GET, PUT | Dados da marca (nome, cor primária) |
| `/api/banner-slides` | GET, POST | Listar/criar slides do carrossel do banner |
| `/api/banner-slides/[id]` | PATCH, DELETE | Editar/excluir slide — DELETE apaga os arquivos de imagem de `public/uploads/banners/` |
| `/api/fidelidade/config` | GET, PUT | Configurações do programa de fidelidade (`LoyaltyConfig`) |
| `/api/auth/[...nextauth]` | — | next-auth handlers |
| `/api/whatsapp/cardapio` | GET | Lista de produtos para o bot WhatsApp (n8n); auth por Bearer `WHATSAPP_API_KEY` |
| `/api/whatsapp/sessao/[phone]` | GET, PATCH, DELETE | Estado da sessão WhatsApp por telefone; auth por Bearer |
| `/api/whatsapp/pedido` | POST | Cria pedido a partir do WhatsApp (n8n); gera link InfinityPay; auth por Bearer |

---

## Arquitetura de Pastas

```
src/
├── app/
│   ├── cardapio/              # Storefront público
│   ├── minha-conta/
│   │   ├── login/             # Fora do grupo protegido (sem auth check)
│   │   └── (protected)/       # Route group — auth via layout.tsx (role CUSTOMER)
│   ├── admin/
│   │   ├── login/             # Fora do grupo protegido
│   │   └── (protected)/       # Route group — auth via layout.tsx (role ADMIN)
│   └── api/                   # API routes
├── components/
│   ├── admin/                 # AdminSidebar, OrderStatusBadge, OrderActions, StockActions
│   │                          # DashboardCharts ("use client" — RevenueAreaChart, OrdersBarChart)
│   ├── storefront/            # MenuClient, CartDrawer, CheckoutModal, CustomerNav
│   └── ui/                    # shadcn-style: Button, Input, Card, Badge, etc.
├── generated/prisma/          # Cliente Prisma gerado — não editar manualmente
├── lib/
│   ├── prisma.ts              # Singleton com PrismaPg adapter
│   ├── auth.ts                # nextAuthOptions (dois providers: admin + customer)
│   ├── customer-auth.ts       # Helper getCustomerFromSession — retorna {customer, error}
│   ├── utils.ts               # formatCurrency, ageLabel, orderStatusLabel, etc.
│   ├── cep.ts                 # ViaCEP integration
│   ├── haversine.ts           # Cálculo de distância crow-fly × 1.3 (fator de estrada); exporta WAREHOUSE_LAT/LNG
│   ├── geocoding.ts           # Geocodifica CEP via Nominatim (OSM, gratuito); cache em memória por CEP
│   ├── infinitepay.ts         # Client da API InfinityPay — createPaymentLink(), checkPayment()
│   ├── nfse.ts                # NFS-e GissOnline ABRASF 2.04 — getNfseConfig(), emitirNfse(), getCertStatus()
│   └── sse.ts                 # SSE event emitter global (singleton) — emitAdminEvent(); exige runtime nodejs
├── store/
│   └── cart.ts                # Zustand — carrinho persistido em localStorage; add() retorna "ok"|"stock_limit"
└── types/
    └── next-auth.d.ts         # Extensão: Session.user { id, role, phone }, User, JWT

print-agent/                   # Agente local para impressora térmica ESC/POS
├── index.js                   # Subscreve SSE e imprime via node-thermal-printer
├── package.json
└── .env.example               # ERP_URL, PRINTER_TYPE, PRINTER_INTERFACE

public/
└── uploads/
    ├── products/              # Imagens de produtos enviadas via /api/upload (criado automaticamente)
    └── banners/               # Imagens dos slides do banner via /api/upload-banner (criado automaticamente)
```

---

## Autenticação — Dois Providers

`src/lib/auth.ts` define dois `CredentialsProvider` coexistentes:

| Provider ID | Acesso | Identificador | role no JWT |
|---|---|---|---|
| `credentials` | `/admin` | email | `"ADMIN"` |
| `customer-credentials` | `/minha-conta` | telefone **ou** email | `"CUSTOMER"` |

O JWT estende os campos padrão com `role` e `phone`. A sessão expõe `session.user.role` e `session.user.phone`.

**`SessionProvider`** — `src/components/Providers.tsx` envolve `{children}` no `src/app/layout.tsx` para que `useSession()` funcione em qualquer componente client (incluindo `CheckoutModal`).

**Proteção de rotas admin** — `src/app/admin/(protected)/layout.tsx` verifica apenas `if (!session?.user)` — **não verifica a role**. Qualquer usuário autenticado (inclusive CUSTOMER) passa pelo layout, mas as API routes verificam `role === "ADMIN"` individualmente e retornam 401.

**Proteção de rotas do cliente** — `src/app/minha-conta/(protected)/layout.tsx` chama `getServerSession`, verifica `role === "CUSTOMER"`, redireciona para `/minha-conta/login` se necessário.

**Helper de API** — `src/lib/customer-auth.ts`:
```typescript
export async function getCustomerFromSession() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CUSTOMER") return { customer: null, error: 401 };
  const customer = await prisma.customer.findUnique({ where: { id: session.user.id } });
  return { customer, error: customer ? null : 404 };
}
```

---

## Checkout — Integração com Cliente Logado

`CheckoutModal` detecta `useSession()` e, quando `role === "CUSTOMER"`:

1. **Passo cliente**: exibe banner verde "Logado como [Nome]", pré-preenche nome/email/telefone (telefone readonly).
2. **Passo endereço**: busca `GET /api/minha-conta/enderecos`, exibe cards de endereços salvos com taxa de entrega. Botão dashed "Usar outro endereço" permite digitar manualmente.
3. **Passo pagamento**: métodos separados em "Pague agora" (ONLINE_PIX, ONLINE_CREDIT → InfinityPay) e "Pague na entrega" (PIX, Cartão, Dinheiro).
4. **Criação do pedido**: ao selecionar endereço salvo, usa o `id` do endereço diretamente. Se pagamento online → link InfinityPay gerado e exibido na tela de sucesso com botão "Pagar agora →".
5. **Passo sucesso**: se pagamento online, exibe link InfinityPay; caso contrário, exibe status do pedido.

---

## Gateway de Pagamento — InfinityPay

- **API**: `POST https://api.checkout.infinitepay.io/links` — sem autenticação por header, só `handle` no body
- **Autenticação**: `INFINITEPAY_HANDLE` no `.env` (sua InfiniteTag sem o `$`)
- **Webhook**: `POST /api/pagamentos/webhook` — InfinityPay chama quando pagamento confirmado; atualiza `Payment.status = PAID` e `Order.status = CONFIRMED`; emite SSE `order_confirmed`
- **Reenvio**: `POST /api/pedidos/[id]/pagamento` — gera novo link para pedido com pagamento pendente
- **Preços**: sempre em centavos (`price: Math.round(valor * 100)`)
- **`order_nsu`**: usa o `Order.id` como identificador de pedido no gateway

---

## Taxa de Entrega por Distância (Haversine)

- Zonas configuradas com `maxRadiusKm` são matchadas por distância real (crow-fly × 1.3)
- Warehouse: `WAREHOUSE_LAT`/`WAREHOUSE_LNG` no `.env` — **verificar coordenadas no Google Maps**
- Geocodificação do CEP do cliente via **Nominatim** (OSM, gratuito, sem chave): cache em memória por CEP
- `/api/cep` tenta primeiro zonas por distância, fallback para matching por bairro/cidade (legado)
- Admin `/admin/zonas`: campo "Raio máximo (km)" — se preenchido, zona funciona por distância; se vazio, usa bairros/cidades

---

## SSE — Eventos em Tempo Real para o Admin

- `src/lib/sse.ts` — singleton `EventEmitter` global (`global.__sseEmitter`); padrão igual ao singleton Prisma
- `GET /api/admin/events` — SSE stream; `runtime = "nodejs"` obrigatório; mantém conexão com ping a cada 25s
- Eventos emitidos: `order_new` (novo pedido criado), `order_confirmed` (pagamento confirmado), `order_status` (status avançado manualmente)
- Admin `/admin/pedidos` subscreve via `EventSource`; ao receber `order_confirmed` → exibe toast com botão "Imprimir" que abre romaneio em popup (já auto-imprime via `window.print()` no `onload`)

---

## Impressora Térmica — Print Agent

- `print-agent/index.js` — script Node.js independente que roda no computador da loja
- Subscreve SSE de `/api/admin/events`; ao receber `order_confirmed` → busca pedido via API → formata ESC/POS → envia para impressora
- Configurar `print-agent/.env` com `ERP_URL`, `PRINTER_TYPE` (epson/star), `PRINTER_INTERFACE` (USB/TCP/Serial)
- Para rodar em produção: `pm2 start print-agent/index.js --name banguelas-print`
- Instalar dependências: `cd print-agent && npm install`

---

## Carrinho — Limite de Estoque

- `CartProduct` tem campo opcional `stock?: number` (undefined = sem limite)
- `add()` e `updateQty()` retornam `"ok"` ou `"stock_limit"` — nunca excedem o estoque
- `CartDrawer`: botão `+` desabilitado + label "Limite de estoque" quando `quantity >= product.stock`
- `MenuClient`: passa `stock: p.stockItem?.quantity` ao chamar `add()`

---

## WhatsApp Bot — Endpoints para n8n

Todos os endpoints abaixo são protegidos por `Authorization: Bearer ${WHATSAPP_API_KEY}`.

| Endpoint | Uso no n8n |
|----------|------------|
| `GET /api/whatsapp/cardapio` | Listar produtos disponíveis com estoque |
| `GET /api/whatsapp/sessao/:phone` | Ler estado da sessão (carrinho, estado do fluxo) |
| `PATCH /api/whatsapp/sessao/:phone` | Atualizar sessão (ex: `{ state: "CHECKOUT", cartData: [...] }`) |
| `DELETE /api/whatsapp/sessao/:phone` | Resetar sessão após pedido concluído |
| `POST /api/whatsapp/pedido` | Criar pedido; retorna `{ orderId, orderNumber, total, paymentLinkUrl }` |

Estados da sessão (`WhatsAppSession.state`): `IDLE`, `MENU`, `ORDERING`, `CHECKOUT`, `AWAITING_PAYMENT`, `PAUSED_HUMAN`

Para takeover humano: setar `{ state: "PAUSED_HUMAN", pausedAt: new Date() }` via PATCH — o n8n deve checar esse estado antes de responder.

---

## Modelos Principais do Banco

- **Brand** — multi-marca; campos legados de banner texto mantidos mas não usados na UI
- **BannerSlide** — slides do carrossel: `desktopImageUrl`, `mobileImageUrl`, `linkUrl?`, `order`, `active`
- **Category** — `name`, `slug`, `ageMin`/`ageMax` em meses, `order`, `active`
- **Customer** — `phone` único, `email`, `passwordHash`, `lastOrderAt`; campos de notificação `notifWhatsapp/Email/Promos/Reorder`
- **Child** — `birthDate` → faixa etária calculada em meses para filtros
- **Product** — `ageMin`/`ageMax` em meses, `frozen`, `featured`, `priceOriginal`
- **ProductImage** — `url`, `isMain`, `alt`, `order`
- **Order** — enum `OrderStatus` (PENDING→CONFIRMED→IN_PRODUCTION→READY→DISPATCHED→DELIVERED); campo `paymentLinkUrl String?` para link InfinityPay
- **Payment** — `method`, `status`, `gatewayId`, `gatewayData Json?`; métodos online: `ONLINE_PIX`, `ONLINE_CREDIT`
- **LoyaltyCard** — pontos acumulados por pedido; tiers: BRONZE/SILVER/GOLD/PLATINUM
- **LoyaltyConfig** — configurações do programa de fidelidade por brand
- **Coupon** — tipo PERCENTAGE/FIXED/FREE_DELIVERY, `firstOrderOnly`, faixa etária opcional
- **DeliveryZone** — `neighborhoods[]`, `cities[]`, `maxRadiusKm Float?`, `fee`, `freeAbove`, `minOrder`; se `maxRadiusKm` preenchido, zona é matchada por distância
- **WhatsAppSession** — `phone` único, `state`, `cartData Json?`, `customerId?`, `pausedAt?`, `expiresAt?`
- **FollowUp** — CRM automático com tipos INACTIVE_30/60/90, BIRTHDAY_CHILD, etc.
- **FiscalDocument** — tipo ROMANEIO/NFCE/NFE (NFCe pendente de integração SEFAZ)
- **SchoolParent** — pai com mensalidade escolar; CPF, email, telefone, escola, nome da criança, `monthlyFee`, `dueDay`, `active`
- **MonthlyInvoice** — mensalidade por pai × mês/ano; `status` (PENDING/ISSUED/ERROR/CANCELLED), `rpsNumber`, `nfseNumber`, `nfseVerifyCode`, `nfseXml @db.Text`, `nfseLink`, `nfseError`; unique em `[schoolParentId, referenceMonth, referenceYear]`
- **NfseSequence** — contador singleton de RPS (`id="rps_counter"`), incrementado atomicamente em `$transaction`
- **NfseConfig** — singleton (`id="singleton"`); dados fiscais editáveis via `/admin/escola` → Configurações: `cnpj`, `im`, `razaoSocial`, `itemServico`, `codTributacao`, `aliquotaIss`, `ambiente`, `wsUrl`, `wsHomologUrl`

---

## Programa de Fidelidade — Modelo de Negócio

O programa usa um modelo de **cartão de pontos** (punch card), não acúmulo contínuo. A lógica está em `LoyaltyConfig`:

| Campo | Padrão | Descrição |
|-------|--------|-----------|
| `programEnabled` | `true` | Liga/desliga o programa |
| `targetOrders` | `5` | Pedidos necessários para completar |
| `minOrderValue` | `100.00` | Valor mínimo por pedido para contar |
| `completionPeriodDays` | `30` | Prazo para completar a partir do 1º pedido válido |
| `rewardType` | `"FIXED"` | Tipo da recompensa: `FIXED` (R$) ou `PERCENTAGE` (%) |
| `rewardValue` | `30.00` | Valor do desconto ao completar |
| `rewardValidDays` | `30` | Validade do desconto após completar o programa |
| `minIntervalHours` | `24` | Intervalo mínimo entre pedidos válidos |
| `onlyDelivery` | `true` | Apenas pedidos de delivery contam |
| `notCumulativeWithCoupons` | `true` | Desconto não acumula com outros cupons |

---

## Regras de Negócio Importantes

1. **Decremento de estoque** acontece dentro de `prisma.$transaction` no POST `/api/pedidos`
2. **Pontos de fidelidade** são creditados automaticamente na criação do pedido (1pt/R$1)
3. **Romaneio** é HTML puro com `window.print()` no `onload` — sem biblioteca PDF; abre em popup via `window.open(..., "popup=1")`
4. **ViaCEP + Nominatim** — ViaCEP preenche endereço; Nominatim geocodifica CEP para calcular distância até o CD
5. **`export const dynamic = "force-dynamic"`** obrigatório em páginas que acessam DB diretamente (ex: `/cardapio`)
6. **Proteção de rotas admin**: route group `(protected)` em `/admin/(protected)` com layout que verifica `role === "ADMIN"`
7. **Proteção de rotas do cliente**: route group `(protected)` em `/minha-conta/(protected)`; login fora do grupo para evitar loop de redirect
8. **Upload de imagens de produto**: `POST /api/upload` exige `runtime = "nodejs"`. Sharp → WebP 800×800 max. Pasta `public/uploads/products/` criada automaticamente.
9. **Upload de imagens de banner**: `POST /api/upload-banner?type=desktop|mobile` → 1400×480 ou 800×600. Salva em `public/uploads/banners/`.
10. **Imagem principal**: ao definir `isMain: true`, as demais são resetadas para `false` no mesmo request.
11. **Banner do cardápio**: slides via `BannerSlide` (active, ordered by `order`). Fallback: fundo colorido + mascote. Auto-avanço 4s, pausado no hover, swipe touch ≥40px.
12. **Soft-delete em categorias**: `DELETE /api/categorias/[id]` seta `active: false`.
13. **Cadastro de cliente**: se telefone existe sem `passwordHash` → ativa conta em vez de criar novo registro.
14. **Reiniciar servidor após `prisma generate`**: `npx prisma db push && npx prisma generate` → apagar `.next/` → reiniciar.
15. **Pedidos não pagos**: `Payment.status = PENDING` com método `ONLINE_*` → badge âmbar na lista; botão "Cobrar" gera novo link e abre WhatsApp Web com mensagem pronta.
16. **SSE singleton**: `global.__sseEmitter` — funciona em processo único (dev + PM2 single process). Não funciona com múltiplos workers; adaptar para Redis pub/sub em cluster.
17. **NFS-e**: `export const runtime = "nodejs"` obrigatório nas rotas de emissão (usa `fs`, `https`, `node-forge`). Certificado A1 em `certs/cert.pfx` (pasta fora de `src/`).

---

## Módulo Escola / NFS-e

### Fluxo mensal
1. Admin acessa `/admin/escola` → aba **Mensalidades**
2. Seleciona mês/ano → clica **"Gerar mensalidades"** → cria `MonthlyInvoice` (status `PENDING`) para todos os pais ativos
3. Clica **"Emitir NFS-e em lote"** → `POST /api/escola/mensalidades/emitir-lote` → emite uma a uma para GissOnline → status muda para `ISSUED` ou `ERROR`
4. Pais com erro ficam disponíveis para retry individual

### Webservice GissOnline (SJRP)
- Plataforma: **GissOnline by Eicon** — ABRASF 2.04
- Portal contribuinte: `https://sjrp.giss.com.br/portal`
- Produção: `https://ws-sjrp.giss.com.br/service-ws/nf/nfse-ws`
- Homologação: `https://ws-ficticio.giss.com.br/service-ws/nf/nfse-ws` — **DNS não resolve; não há ambiente de homologação ativo para SJRP**
- Operação SOAP: `GerarNfse` (síncrona — retorna NFS-e imediatamente)
- Autenticação dupla: XML assinado com A1 (xmldsig RSA-SHA1) + mTLS (A1 como SSL client cert)

### Estrutura SOAP correta (GissOnline)
O WSDL do GissOnline usa namespace `http://nfse.abrasf.org.br` e exige dois parâmetros:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:nfse="http://nfse.abrasf.org.br">
  <soapenv:Body>
    <nfse:GerarNfseRequest>
      <nfseCabecMsg><!-- cabecalho XML escapado --></nfseCabecMsg>
      <nfseDadosMsg><!-- GerarNfseEnvio XML assinado, escapado --></nfseDadosMsg>
    </nfse:GerarNfseRequest>
  </soapenv:Body>
</soapenv:Envelope>
```

- `SOAPAction`: `"http://nfse.abrasf.org.br/GerarNfse"`
- O conteúdo de ambos os campos é **string XML escapada** (entidades HTML: `&lt;` etc.)
- O `GerarNfseEnvio` usa namespace `http://www.abrasf.org.br/nfse.xsd`
- O elemento assinado é `InfDeclaracaoPrestacaoServico` com atributo `Id="rps{N}"`

### Resposta do servidor
A resposta vem HTML-encoded dentro de `<outputXML>` e usa prefixos de namespace (`ns3:Codigo`, `ns4:GerarNfseResposta`, etc.):

```
<outputXML>&lt;ns4:GerarNfseResposta ...&gt;...&lt;/ns4:GerarNfseResposta&gt;</outputXML>
```

O `parseResponse` em `src/lib/nfse.ts` extrai, decodifica e usa regex tolerante a namespace (`<(?:\w+:)?Codigo>`).

### Certificado A1 — Banguelas
- **CA:** AC SyngularID Multipla (ICP-Brasil)
- **CNPJ no cert:** `41150762000151` — deve bater com `NfseConfig.cnpj`
- **Validade:** até 2027-06-08
- **Revogação:** CRL em `syngularid.com.br` (sem OCSP) — o GissOnline baixa a CRL a cada requisição, o que pode causar lentidão (timeout de 90s configurado no axios)
- **node-forge:** carrega o PFX com `pkcs12FromAsn1(asn1, senha)` — senha com caracteres especiais (ex: `#`) **deve ser colocada entre aspas no `.env`**: `NFSE_CERT_PASSWORD="senha#aqui"`

### Códigos de erro conhecidos
| Código | Significado |
|--------|-------------|
| V999 / E183 | Assinatura digital inválida **ou** certificado não pertence ao prestador **ou** CNPJ não habilitado no portal |
| Timeout >30s | GissOnline fazendo validação CRL do certificado ICP-Brasil — normal na primeira emissão |

### Variáveis de ambiente — apenas certificado permanece no .env
```env
# Os dados fiscais (CNPJ, IM, etc.) são configurados via /admin/escola → Configurações
# e ficam gravados no banco (NfseConfig). O .env é apenas fallback.
NFSE_CERT_PATH=./certs/cert.pfx      # obrigatório — caminho do .pfx (certs/ é gitignored)
NFSE_CERT_PASSWORD="senha#aqui"      # aspas obrigatórias se a senha tiver # ou caracteres especiais
```

### Timeouts nos route handlers
- `[id]/emitir`: `maxDuration = 120` (segundos)
- `emitir-lote`: `maxDuration = 300` (segundos)
- axios: `timeout = 90_000` ms

### Modelos novos
- **`SchoolParent`** — pai com mensalidade escolar; CPF, email, escola, criança, `monthlyFee`, `dueDay`
- **`MonthlyInvoice`** — mensalidade por pai × mês/ano; status, RPS, NFS-e número/XML/link/erro; unique em `[schoolParentId, referenceMonth, referenceYear]`
- **`NfseSequence`** — id="rps_counter", contador de RPS, incrementado em `$transaction`
- **`NfseConfig`** — id="singleton"; dados fiscais editáveis via UI: CNPJ, IM, razão social, item LC 116, código tributação, alíquota, ambiente, URLs webservice

### API routes
| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/escola/config` | GET, PUT | Ler/salvar `NfseConfig`; GET também retorna status do certificado A1 |
| `/api/escola/pais` | GET, POST | Listar / criar pais |
| `/api/escola/pais/[id]` | PATCH, DELETE | Editar / desativar pai (soft-delete: `active=false`) |
| `/api/escola/mensalidades` | GET | Listar mensalidades com filtros `?month=&year=&status=` |
| `/api/escola/mensalidades/gerar` | POST | Gerar mensalidades do mês para todos os pais ativos |
| `/api/escola/mensalidades/[id]/emitir` | POST | Emitir NFS-e individual; `runtime = "nodejs"`, `maxDuration = 120` |
| `/api/escola/mensalidades/emitir-lote` | POST | Emitir NFS-e para todas PENDING+ERROR do mês; `runtime = "nodejs"`, `maxDuration = 300` |

---

## Convenções de Código

- Componentes de página grandes → `"use client"` com fetch via axios
- Componentes simples de leitura → Server Components com Prisma direto
- Gráficos (Recharts) → componente `"use client"` separado; dados passados como props do Server Component
- Modais → estado local no próprio componente (sem context/global state)
- Formulários inline → `useState` + objeto `form` (sem react-hook-form nos admin simples)
- Cores: laranja `#F26C21` (primário), zinc para neutros; **dark mode desativado** — app é light-only
- Background: `#f4f4f5` (zinc-100); cards: `#ffffff`
- Arredondamentos: `rounded-2xl` para cards, `rounded-xl` para inputs/botões
- `(prisma.model as any).method()` — necessário em alguns modelos por causa dos tipos gerados com `// @ts-nocheck`

---

## Catálogo Real

Os produtos e categorias reais da Banguelas foram importados via `prisma/reset-catalog.ts` (fonte: `references/Lista produtos goomer.xlsx`). O script remove todos os fictícios e cadastra os reais.

| Categoria | Qtd |
|---|---|
| Refeições com sal | 21 |
| Papinhas sem sal | 17 |
| Lanchinhos | 19 |
| Combinhos práticos | 8 |
| Papinhas doces | 5 |
| Arraiá | 5 |
| Páscoa | 6 |
| Caldos | 3 |
| Caseirinhos | 3 |
| Natal | 6 |
| **Total** | **93** |

- Estoque inicial: 3 unidades por produto.
- **8 fotos cadastradas** (em `references/fotos/`): bolinho-cacau, caldo-mandioca, combo, pê-efinho-baby, pê-efinho, polentinha, risotinho, tutuzinho — vinculadas via API em 2026-06-16.
- 85 produtos restantes ainda sem foto — adicionar via `/admin/produtos`.

---

## Filtros e Ordenação do Cardápio

### Cardápio público (`/cardapio` → `MenuClient.tsx`)
- Chips de filtro no header são **dinâmicos**: mostram as categorias ativas do banco (ordenadas por `category.order`), não faixas etárias fixas.
- Estado: `filterCat: string | null` — `null` = todos, `string` = `category.id`.
- Filtro por texto (`search`) e por categoria funcionam juntos.
- **Header**: exibe `public/logo.svg` (logo horizontal) em lugar do ícone mascote + texto "banguelas" + linha de entrega.
- **Descrição nos cards**: `product.description` exibida abaixo do título, truncada em 2 linhas (`WebkitLineClamp: 2`), cor `#9A8A78`, 12px — aparece apenas quando preenchida.
- **Categorias recolhidas**: quando `filterCat === null`, cada seção de categoria (`ProductSection`) exibe no máximo 8 produtos (`COLLAPSED_COUNT = 8`, equivalente a 2 linhas num layout de 4 colunas desktop) + botão **"Ver todos (N) →"** quando há mais. Clicar no botão chama `setFilterCat(category.id)`, aplicando o filtro e exibindo todos os produtos da categoria. Seção Destaques não é recolhida.

### Admin `/admin/produtos`
- Filtro de status (Todos / Ativos / Estoque baixo) + filtro por categoria em pills.
- Quando "Todas as categorias" está selecionado, produtos são agrupados por categoria com cabeçalhos.
- Botão **Excluir** (lixeira) faz soft-delete via `DELETE /api/produtos/:id` (seta `active: false`) com `window.confirm`.

### Admin `/admin/configuracoes` — Seção "Categorias"
- Modo **Personalizado**: reordena com botões ↑/↓, salva via `PATCH /api/categorias/:id` com `{ order: N }` para cada categoria.
- Modo **Alfabético**: ordena A–Z automaticamente e salva tudo de uma vez.
- A ordem salva aqui define a ordem dos chips no cardápio público e dos grupos no admin de produtos.

---

## Pendente / Próximos Passos

- [ ] Página `/admin/produtos/novo` — formulário de criação de produto
- [ ] Adicionar fotos aos 85 produtos restantes via `/admin/produtos` (8 já cadastradas)
- [ ] Aplicar regras de `LoyaltyConfig` na validação de pedidos (contagem válida, intervalo mínimo, etc.)
- [ ] Aplicar desconto de fidelidade no checkout (cliente com recompensa ativa)
- [x] NFS-e mensal para pais de escola — integração direta GissOnline ABRASF 2.04 (SJRP)
- [ ] NFCe por pedido via SEFAZ (estrutura `FiscalDocument` já existe no schema)
- [ ] Fluxo n8n para WhatsApp bot (Evolution API + Gemini + endpoints `/api/whatsapp/*`)
- [ ] Multi-unidade / franqueados — fase 0 feita (Unit + unitId + escopo das rotas); login Google feito; cadastro de franqueado/link/usuários, sync de catálogo, reposição, avisos/pop-ups, premiações e dashboard da rede feitos
- [ ] Segunda marca "Minuto Menu" (mesma stack, nova Brand no banco)
- [x] Deploy em produção (Coolify + Traefik, 2026-09-30) — ver "Segunda etapa" e "Acessos e infraestrutura de produção"
- [ ] Produção: volume persistente para `public/uploads/` (confirmar no Coolify), `print-agent` como serviço, backup agendado do banco, DNS curinga das franquias, trocar senhas dos admins
