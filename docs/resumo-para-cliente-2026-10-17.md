# Resumo do dia — 17/10/2026

**Projeto:** Cardápio online e sistema de gestão da Banguelas
**Em uma frase:** hoje o sistema passou por uma revisão completa de segurança, ganhou o pagamento online por PIX e cartão e recebeu três melhorias de uso. Tudo já está no ar.

---

## 1. Revisão de segurança

Fizemos uma auditoria no sistema inteiro, como se alguém tentasse invadi-lo ou ver dados que não deveria. Encontramos pontos de atenção, corrigimos os mais sérios e testamos cada correção.

**O que foi consertado (os três mais importantes):**
- **Dados de clientes expostos:** quem fizesse um pedido informando o telefone de outro cliente podia receber de volta dados dele (CPF, e-mail e a senha em formato embaralhado). Isso não acontece mais.
- **Pagamento falso:** era possível "avisar" ao sistema que um pedido tinha sido pago sem ter pago. Agora o sistema sempre confirma o pagamento diretamente com a operadora antes de liberar o pedido.
- **Arquivos do servidor:** um usuário do painel mal-intencionado poderia apagar arquivos importantes do servidor por meio das fotos de produto. Agora só é possível mexer nas fotos do próprio sistema.

**Outras proteções que entraram:**
- **Atualizações de segurança** em todas as peças do sistema que estavam desatualizadas ou com falhas conhecidas.
- **Proteção contra tentativas de adivinhar senha:** depois de 5 senhas erradas a conta é bloqueada por 15 minutos. Pedidos e cadastros em excesso, vindos de um mesmo lugar, também são barrados.
- **Desligamento imediato de acesso:** se um funcionário for desativado ou trocar de senha, ele perde o acesso na hora, mesmo que estivesse com o sistema aberto.
- **Proteções do navegador:** o site não pode mais ser "copiado" dentro de outras páginas para enganar usuários, e há travas contra códigos maliciosos.
- **Dados digitados validados:** valores absurdos ou fora do normal (preço negativo, quantidade enorme, textos gigantes) são recusados.
- **Servidor mais seguro:** o sistema passou a rodar com permissões reduzidas, caso algum dia seja atacado, o estrago possível é muito menor. O banco de dados não fica mais exposto na rede.
- **Senha de cliente:** o mínimo para criar conta subiu de 6 para 8 caracteres.

## 2. Pagamento online (PIX e cartão)

O cliente agora pode **pagar pelo próprio cardápio**, por PIX ou cartão, usando a InfinitePay.
- Cada unidade (matriz ou franquia) pode ter **a sua própria conta de recebimento**, cadastrada em *Configurações*.
- O valor cobrado confere com o pedido (produtos, frete e descontos).
- Assim que o pagamento é confirmado, o pedido é liberado automaticamente.
- Se a operadora estiver fora do ar na hora do pedido, o cliente é avisado e a equipe consegue reenviar o link de pagamento depois.
- Unidades que ainda não cadastraram a conta continuam aceitando só pagamento na entrega.

## 3. Melhorias de uso

- **Cupons agora podem ser editados.** Antes só dava para criar, ativar/desativar ou excluir. Também corrigimos a validade: um cupom "válido até dia 20" agora vale até o fim do dia 20 (antes terminava às 21h do dia anterior).
- **O botão "Novo produto" passou a funcionar.** Ele não fazia nada. Agora o produto é criado e já dá para adicionar as fotos em seguida.
- **Login com Google corrigido.** Depois das atualizações, o botão "Entrar com Google" estava mandando o cliente para um endereço errado. A correção está no ar; falta apenas um teste real de login (veja o item 5).

## 4. Como garantimos que está tudo certo

- Criamos uma **bateria de testes automáticos** (mais de 100 verificações) que simula clientes, funcionários e até tentativas de ataque. Ela roda em navegadores reais (Chrome e Firefox) e precisa passar 100% antes de qualquer publicação.
- Antes de cada publicação foi feita uma **cópia de segurança do banco de dados**, conferida e guardada.
- **Os dados existentes foram preservados:** as atualizações só acrescentaram campos novos, sem apagar nada. Antes de cada publicação o banco tinha 12 clientes e 93 produtos (confirmado na cópia de segurança).

## 5. O que ainda falta (próximos passos)

| Item | Por que importa | O que precisamos |
|---|---|---|
| Confirmar o e-mail/telefone no cadastro do cliente | Impede que alguém crie uma conta usando o telefone de outra pessoa | Decidir como enviar o código: por WhatsApp ou por e-mail |
| Teste real do pagamento | Confirma de ponta a ponta o PIX/cartão | Fazer um pedido de teste de baixo valor |
| Teste do login com Google | Confirma a correção feita hoje | Um login de verdade no site |
| Cópia de segurança automática diária | Hoje as cópias são feitas manualmente antes de cada atualização | Ativar o agendamento no servidor |

## 6. O que pedimos ao cliente

1. Fazer um pedido de teste pagando por PIX (valor baixo) e avisar se tudo correu bem.
2. Testar o "Entrar com Google" no site.
3. Informar o canal preferido para enviar o código de confirmação do cadastro (WhatsApp ou e-mail).
