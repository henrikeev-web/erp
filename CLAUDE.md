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

## Financeiro (contas a pagar / a receber)

Tela `/admin/financeiro` (abas: Resumo, A pagar, A receber, Recorrentes, Fornecedores, Centros de custo). **Só ADMIN/SUPER_ADMIN** (`requireStaff(["SUPER_ADMIN","ADMIN"])` nas APIs e guarda no servidor na página); STAFF não vê. Tudo por unidade.

- **Modelos**: `FinancialEntry` (a pagar e a receber num só: `type` PAYABLE|RECEIVABLE; `status` OPEN|PAID|CANCELLED; "vencido" é calculado = OPEN com `dueDate` < hoje), `RecurringEntry` (modelo da recorrência), `Supplier`, `CostCenter`. `FinancialEntry.source` (MANUAL|RECURRING|ORDER|COURIER) + `sourceKey` (único por unidade) tornam a geração automática idempotente — usar para os repasses de entregador e pedidos faturados.
- **Datas** são "só data" (`@db.Date`), aritmética **em UTC** (`src/lib/financeiro.ts`), e "hoje" é o dia em **America/Sao_Paulo** (`BUSINESS_TZ`), não o do servidor. Filtros de período de pedidos usam `-03:00`.
- **Recorrência**: `every` + `period` (DAY|WEEK|MONTH|YEAR) — a UI expõe Semanal/Mensal/Anual/Personalizada (a cada N…). Cada cobrança é calculada a partir da data inicial (dia 31 mensal → último dia dos meses curtos, sem "grudar" no 28). `materializeRecurring(unitId)` gera até hoje + 60 dias, é idempotente (`@@unique([recurringId, dueDate])`) e roda em toda consulta de lançamentos/resumo — **não há cron**.
- **Editar recorrência**: mudar valor/descrição/vínculos atualiza as cobranças em aberto de hoje em diante (sobrescreve edição individual); mudar frequência/datas ou pausar remove só as **estritamente futuras** em aberto e regenera. Pagas, vencidas e a que vence hoje não são tocadas.
- **Regras**: lançamento pago fica travado (reabrir para editar); ocorrência de recorrência e lançamentos automáticos **não se excluem** (recriaria) — cancelar; só MANUAL não pago pode ser excluído. Fornecedor/centro de custo com histórico são desativados em vez de excluídos. Parcelamento: `amount` é o total, dividido igualmente com a última parcela absorvendo os centavos.
- **Pendente**: visão consolidada da matriz (todas as unidades) virá com o dashboard das franquias; integrar repasse de entregadores (item 4) e faturamento de revendedores (item 6) via `source`/`sourceKey`.

---

## Infraestrutura Docker

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
- [ ] Multi-unidade / franqueados — fase 0 feita (Unit + unitId + escopo das rotas); login Google feito; falta dashboard da matriz, cadastro de franqueado/revendedor, pedidos de reposição, sync de catálogo
- [ ] Segunda marca "Minuto Menu" (mesma stack, nova Brand no banco)
- [ ] Deploy em VPS (PM2 + Nginx + Let's Encrypt) — volume persistente para `public/uploads/` + `print-agent` rodando como serviço separado
