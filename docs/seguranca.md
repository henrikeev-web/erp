# Segurança — Banguelas ERP

Resumo da auditoria de 2026-10-17, do que foi corrigido, do que ficou pendente e de como verificar. Nenhum segredo está registrado aqui.

## Princípios (valem para todo código novo)

1. **A unidade vem do host** (`x-unit-slug`, sobrescrito em `src/proxy.ts`). Toda consulta filtra por `unitId`; update/delete usam `where: { id, unitId }`.
2. **Autorização no servidor, sempre.** Rotas do painel: `requireStaff()` / `requireHQAdmin()` / `requireFranchiseAdmin()` (`src/lib/api-auth.ts`). Rotas de cliente: `getCustomerSession()`. Esconder botão no front não é controle.
3. **Entrada por lista de permitidos.** Nunca repasse o corpo da requisição ao Prisma (nem "tudo menos alguns campos"). Use `src/lib/sanitize.ts` (`parseProductBasics`, `parseCoupon`, `parseStockMove`) ou zod com limites (`.max()`).
4. **Resposta pública só com o necessário.** Em rota pública nunca devolva o registro inteiro de cliente/pedido: monte o objeto campo a campo (ver `api/checkout/route.ts`). `passwordHash` nunca sai.
5. **Caminhos de arquivo só validados.** URLs de imagem/banner passam por `src/lib/upload-url.ts` (`isImageUrl`, `isSafeLink`, `uploadFilePath`). Apagar arquivo só com caminho validado dentro de `public/uploads` e sem outra referência (as franquias compartilham as fotos da matriz).
6. **Dinheiro só com prova do gateway.** Pagamento online é confirmado por `payment_check` (ver `docs/pagamentos-infinitepay.md`), nunca pelo corpo de um webhook.
7. **Rotas públicas que criam dados têm rate limit** (`src/lib/rate-limit.ts`).

## O que foi feito

| Área | Medida | Onde |
|---|---|---|
| Pagamento | Webhook InfinitePay não confia no corpo; confirma via `payment_check`, valor ≥ total, idempotente | `lib/payment-confirm.ts`, `api/pagamentos/webhook` |
| Vazamento | Checkout público devolve só campos do pedido (antes incluía hash da senha, CPF, e-mail e notas do cliente) | `api/checkout/route.ts`, `lib/order-service.ts` |
| Arquivos | Path traversal em imagens/banners: URL validada; exclusão só em caminho seguro e sem outras referências | `lib/upload-url.ts`, `api/produtos/[id]/imagens`, `api/banner-slides` |
| XSS | Link do banner só `https` ou caminho interno (bloqueia `javascript:`) | `lib/upload-url.ts` |
| Dependências | Next 16.4.2, next-auth 4.24.15, sharp 0.35.5, axios 1.20, Prisma 7.10.1, xml-crypto 6.4; `@auth/prisma-adapter` removido (não usado); `overrides` força `@auth/core` 0.41.3 | `package.json` |
| Runtime | Docker em Node 22 (Node 20 saiu de suporte); app roda como usuário `node` via entrypoint (`su-exec`) que ajusta a permissão dos uploads | `Dockerfile`, `docker-entrypoint.sh` |
| Força bruta | Login do painel e do cliente: 5 erros por conta e 20 por IP / 15 min; checkout 20/10 min, cadastro 5/h, cupom 30/10 min, CEP 60/10 min por IP | `lib/auth.ts`, `lib/rate-limit.ts` |
| IP real | Usa a entrada do `X-Forwarded-For` escrita pelo proxy confiável (`TRUSTED_PROXY_HOPS`, padrão 1 = Traefik); a da esquerda é forjável | `lib/rate-limit.ts` (`clientIp`) |
| Cabeçalhos | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS (sem `includeSubDomains`), sem X-Powered-By | `next.config.ts` |
| Sessão | O callback `session` relê o banco a cada chamada: usuário/cliente desativado ou apagado perde a sessão na hora; papel e unidade vêm do banco. `User.sessionVersion` sobe na troca de senha, reset, desativação e troca de perfil. JWT dura 7 dias | `lib/auth.ts`, `api/conta/senha`, `api/franquias/[id]/usuarios/[uid]` |
| Entrada | Produto (PUT/POST) e cupom (POST/PATCH) por lista de permitidos; estoque validado e gravado de forma condicional; limites de tamanho no checkout/cadastro/endereços/filhos; senha mínima do cadastro de cliente 8 | `lib/sanitize.ts`, rotas |
| NFS-e | `wsUrl` só `https` em `giss.com.br` (ao salvar e antes de enviar certificado/XML); certificado do servidor sempre validado | `api/escola/config`, `lib/nfse.ts` |
| Bot | Chave do WhatsApp comparada em tempo constante | `lib/api-auth.ts` |
| Infra | Compose: portas do banco/app só em `127.0.0.1`; senha do Postgres por `POSTGRES_PASSWORD` (obrigatória no compose do Coolify) | `docker-compose*.yml` |

## Riscos conhecidos / pendências

- **Verificação de telefone e e-mail no cadastro (não implementada).** Hoje quem sabe o telefone de um cliente que só comprou como visitante pode "ativar" essa conta (`api/minha-conta/register`), e pré-cadastrar o e-mail de alguém antes do login Google. Precisa de um canal de envio de código (WhatsApp via n8n ou e-mail/SMTP) — o sistema ainda não envia nenhum.
- **`node-forge`** aparece no `npm audit` sem correção publicada (verificação de assinatura RSA). Não é explorável: o código só lê o nosso `.pfx` da NFS-e.
- **CSP com `'unsafe-inline'`** em scripts e estilos (o Next e o front usam estilos inline). Remover exige nonces e renderização dinâmica.
- **Rate limit em memória**: reinicia com o servidor e não é compartilhado entre processos. Hoje há um container só; com mais de um, trocar o `store` por Redis.
- **Login com Google**: os redirecionamentos do fluxo são testados com produção simulada (`scripts/e2e-security.sh`), mas o OAuth com o Google em si não; após deploys que mexam em auth/CSP/Next, fazer um login real. (Em 2026-10-17 o upgrade do Next fez `req.url` virar `localhost:3000` atrás do proxy e quebrou o início do fluxo; corrigido com `publicOrigin`.)
- **Sem backup agendado do banco** (Coolify → banco → Backups).
- Pedido **cancelado que recebe pagamento** não reabre: o log registra "Estornar manualmente".
- A senha padrão do seed (`admin123`) só pode existir em desenvolvimento.

## Como verificar

```bash
npx tsc --noEmit -p .
npx tsx scripts/test-sanitize.ts        # validadores
npx tsx scripts/test-upload-url.ts      # URLs de upload/links
npx tsx scripts/test-rate-limit.ts      # limite de tentativas e IP real
npx tsx scripts/test-infinitepay.ts     # itens do link, prova de pagamento
npx next build && bash scripts/e2e-security.sh
```

`scripts/e2e-security.sh` cria um banco descartável no container `erp-dev-db`, sobe o app (`next start`, porta 3998) e roda: pagamento com a InfinitePay simulada, vazamento no checkout, path traversal, webhook forjado, cabeçalhos, CSP em Chromium real, rate limit, revogação de sessão, validação de entrada, WhatsApp, NFS-e e as telas de cupom e produto em Chromium e Firefox. As partes de navegador rodam num container isolado (`mcr.microsoft.com/playwright:v1.60.0-noble`), sem instalar nada no host. Termina com `TUDO OK` ou `N FALHA(S)`.

> Prisma 7.10 recusa `db push --accept-data-loss` quando chamado por um agente de IA. Os scripts usam `prisma db push` simples em bancos novos. Migração destrutiva exige autorização explícita do dono.

## Publicar com segurança (runbook)

1. `git push origin main` (o push não dispara deploy).
2. **Backup**: `docker exec el1sceqzhimndmzyxanlb2l7 pg_dump -U erp -Fc banguelas_erp > /root/backups/pre-deploy-AAAAMMDD-HHMM.dump && chmod 600 …`; conferir restaurando num banco temporário do `erp-dev-db`.
3. Deploy: botão **Deploy** no Coolify, ou `GET http://127.0.0.1:8000/api/v1/deploy?uuid=hmi9i2v07jvsk541083ib516` com token temporário (guardado num arquivo `chmod 600`, apagado ao terminar; revogar o token no Coolify).
4. Acompanhar `GET /api/v1/deployments/<deployment_uuid>` até `finished`.
5. Validar: container novo roda como `node`, `prisma db push` sincronizado, `/cardapio` 200, cabeçalhos de segurança, `/api/clientes` sem sessão 401, webhook sem corpo 400, login real (painel e Google).
6. Mudanças de auth/sessão derrubam as sessões abertas: avisar a equipe.

Rollback: restaurar o dump `pre-deploy-*` mais recente e redeployar o commit anterior (`git log`).
