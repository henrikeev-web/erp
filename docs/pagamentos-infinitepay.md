# Pagamento online — InfinitePay

Checkout Integrado da InfinitePay ([documentação oficial](https://www.infinitepay.io/checkout-documentacao)). PIX e cartão. **Uma InfiniteTag por unidade**: cada franquia recebe na própria conta.

## Configuração

- **Admin → Configurações → "Pagamento online (InfinitePay)"** (só ADMIN): informar a InfiniteTag da unidade, sem o `$` (`PUT /api/unit/pagamento`). Em branco = só pagamento na entrega.
- A matriz pode usar `INFINITEPAY_HANDLE` do ambiente enquanto não cadastrar a própria tag. Franquias não têm fallback.
- A InfiniteTag é o nome de usuário da conta no app InfinitePay. **Não há nada a cadastrar no painel da InfinitePay**: a URL do webhook vai em cada link criado.
- Sem tag, o cardápio esconde "PIX Online / Cartão Online" (`/api/unit` → `onlinePayment`) e o servidor recusa pedidos `ONLINE_*` antes de baixar estoque ou gastar cupom.

## Fluxo

1. `createOrder()` (`lib/order-service.ts`) cria o pedido (`Payment.status = PROCESSING`) e chama `issuePaymentLink()` (`lib/payment-link.ts`).
2. O link é criado em `POST https://api.checkout.infinitepay.io/links` com `handle` da unidade, `order_nsu = Order.id`, itens em centavos, `redirect_url` e `webhook_url`. A soma dos itens **tem que fechar com o total** (frete incluso): sem desconto vai uma linha por item + "Taxa de entrega"; com desconto, um item único com o total exato (`buildCheckoutItems`).
3. O cliente paga na página da InfinitePay e volta para `/pedido/retorno?order_nsu&transaction_nsu&slug&…`.
4. A confirmação acontece por **dois caminhos, ambos via `confirmOnlinePayment()`** (`lib/payment-confirm.ts`):
   - webhook `POST /api/pagamentos/webhook` (domínio principal, para todas as unidades);
   - página de retorno `/pedido/retorno` (confere no mesmo instante, sem esperar o webhook).
5. `confirmOnlinePayment` chama `POST /payment_check` (`handle`, `order_nsu`, `transaction_nsu`, `slug`) com a tag da unidade dona do pedido. Só marca como pago se `paid = true` e `paid_amount` (ou `amount`) ≥ total do pedido. Parcelado com juros paga mais e é aceito; pagar menos nunca.
6. A baixa é atômica (`updateMany` de PENDING/PROCESSING → PAID): webhook repetido ou concorrente confirma uma vez só. O pedido PENDING vira CONFIRMED e o painel recebe o evento SSE.

O webhook da InfinitePay **não tem assinatura**. Por isso o corpo é só uma indicação de qual pedido consultar.

## Respostas do webhook

`200` = recebido (pago, já pago ou pedido cancelado — nesse caso o log registra "Estornar manualmente"); `400` = não consegui confirmar (a InfinitePay tenta de novo); `404` = pedido inexistente.

## Falhas

- **Gateway fora do ar ao criar o pedido**: o pedido existe sem link; o cliente vê o aviso "Não conseguimos gerar o link"; a equipe usa "Cobrar" em Pedidos (`POST /api/pedidos/[id]/pagamento`), que reenvia o link.
- **Resposta de `/links` sem URL**: a documentação não descreve o corpo da resposta; o código aceita `url`, `checkout_url`, `link`, `payment_url` (https). Se nenhum vier, o log lista os campos recebidos — ajustar `extractLink` em `lib/infinitepay.ts`.
- **`404 external_checkout_not_enabled`** (log `[pagamento] link de pagamento não gerado`): a conta da InfiniteTag não tem o *Checkout externo* ligado. Ativar em `https://app.infinitepay.io/external-checkout#configuracoes?enabled=true` com a conta dona da tag. O pedido fica salvo sem link; depois de ativar, "Cobrar" gera o link.
- **`422 Total price must be greater than 1`**: total abaixo do mínimo da InfinitePay (aparenta ser R$ 1,00; pedidos de R$ 0,16 falharam). Em testes com cupom de desconto alto, mantenha o total ≥ R$ 1,00. O checkout ainda não avisa antes de criar o pedido.
- **Não dá para embutir a página de pagamento** (iframe): `checkout.infinitepay.io` responde `X-Frame-Options: SAMEORIGIN` e `frame-ancestors 'self' *.infinitepay.io…`. O cliente é redirecionado e volta por `/pedido/retorno`. Pagamento embutido exigiria outra API/gateway.
- **Pedido cancelado que recebeu pagamento**: não reabre; estornar manualmente no app da InfinitePay.

## Testes

- `npx tsx scripts/test-infinitepay.ts` — itens fecham com o total, prova de pagamento, parsing da resposta.
- `scripts/test-payment-e2e.ts` (dentro de `scripts/e2e-security.sh`) — pedido → link → webhook falso/pago a menos/pago → idempotência → pedido de outra unidade → pedido cancelado → gateway fora do ar, com a API da InfinitePay simulada.
- Link real gerado e pagamento aberto com a tag da matriz em 2026-10-17 (formato da resposta de `/links` confirmado).
