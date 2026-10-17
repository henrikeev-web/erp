<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:banguelas-agent-rules -->
# Regras deste projeto (Banguelas ERP)

- Leia `CLAUDE.md` (guia técnico) e `docs/seguranca.md` antes de mexer em auth, checkout, pagamento, upload ou cabeçalhos.
- **Responda ao dono em português brasileiro.**
- **Toda rota escopa por unidade** (`unitId`) e autoriza no servidor (`requireStaff` e variantes). Nunca repasse o corpo da requisição ao Prisma: use `src/lib/sanitize.ts` ou zod com limites. Rota pública nunca devolve o registro inteiro de cliente/pedido.
- **Pagamento online só é confirmado por `payment_check`** (`src/lib/payment-confirm.ts`), nunca pelo corpo do webhook.
- Mudou auth, checkout, pagamento, upload, cupom/produto ou `next.config.ts`? Rode `npx tsc --noEmit -p . && npx next build && bash scripts/e2e-security.sh` e só dê por concluído com `TUDO OK`.
- **Produção**: commit/push/deploy e qualquer acesso ao banco ou ao Coolify só com autorização explícita do dono, e **sempre com backup antes** (`docs/seguranca.md`, runbook). Token do Coolify: arquivo `chmod 600`, apagado ao terminar; peça ao dono para revogá-lo. Nunca grave segredos em arquivos do repositório nem na memória.
- O Prisma 7.10 bloqueia `db push --accept-data-loss` para agentes: em bancos de teste novos use `db push` simples; migração destrutiva em dado real só com consentimento do dono.
<!-- END:banguelas-agent-rules -->
