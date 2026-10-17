# Banguelas ERP

Cardápio online + ERP da **Banguelas Papinhas e Nutrição Infantil** (matriz + franquias). Next.js 16 · React 19 · Prisma 7 · PostgreSQL 16 · Node 22.

Produção: <https://cardapio.banguelas.com.br> (painel em `/admin/login`). Deploy manual pelo Coolify.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Guia técnico completo: stack, multi-unidade, módulos, rotas, infraestrutura, regras do projeto |
| [`docs/seguranca.md`](docs/seguranca.md) | Auditoria de segurança, medidas, pendências, testes e runbook de deploy |
| [`docs/pagamentos-infinitepay.md`](docs/pagamentos-infinitepay.md) | Pagamento online (InfinitePay): configuração, fluxo, falhas, testes |
| [`docs/migracao-multiunidade/`](docs/migracao-multiunidade) | SQLs da migração do banco de produção para multi-unidade |

## Desenvolvimento

```bash
docker compose up -d            # nginx (80) + app + Postgres (portas só em 127.0.0.1)
npm install && npm run dev      # ou dev local em http://localhost:3000
npx prisma generate             # sempre após mudar o schema (client em src/generated/prisma)
npx tsx prisma/seed.ts          # dados de exemplo (admin@banguelas.com.br / admin123 — só desenvolvimento)
```

Variáveis de ambiente: veja a seção "Variáveis de ambiente (.env)" do `CLAUDE.md`. Nunca versione `.env`, senhas, tokens ou certificados.

## Testes

```bash
npx tsc --noEmit -p .
npx tsx scripts/test-sanitize.ts    # e test-upload-url, test-rate-limit, test-infinitepay, test-password, test-combo, test-awards
npx next build && bash scripts/e2e-security.sh   # regressão ponta a ponta (banco descartável + Chromium/Firefox); deve terminar com TUDO OK
```

O `e2e-security.sh` precisa do container `erp-dev-db` (Postgres de teste, porta 5433) e do Docker para o navegador (imagem Playwright). Detalhes em [`docs/seguranca.md`](docs/seguranca.md).

## Publicar

1. `git push origin main` (não dispara deploy). 2. Backup do banco de produção. 3. Deploy no Coolify. 4. Validar o site. Passo a passo em [`docs/seguranca.md`](docs/seguranca.md#publicar-com-segurança-runbook).
