# Impressão automática de pedidos (loja)

Agente local (`print-agent/`) que imprime cada pedido na **Epson TM-T20** (ESC/POS, bobina de 80 mm), em **2 vias**.

## Quando imprime
| Situação | Imprime? |
|---|---|
| Pagamento na entrega (dinheiro, cartão/maquininha, PIX na entrega, faturado) | Assim que o pedido chega (`order_new`) |
| Pagamento online (`ONLINE_*`) | Só depois do pagamento aprovado (`order_confirmed`) |
| Pedido cancelado | Não |
| Mesmo pedido de novo (ex.: confirmado depois no painel) | Não (`printed.json`) |

Falha da impressora (desligada, sem papel) ⇒ o pedido fica em `pending.json` e é tentado a cada 20 s (inclusive depois de reiniciar o PC). Pedido que chega com o PC/agente desligado **não** é recuperado: usar o botão "Imprimir" do painel.

## Cupom
Título (ENTREGA/RETIRADA), `Mov`/`Entrega N (cliente)`/`Entreg:` (entregador ou "nao informado"), cliente, endereço (bairro, complemento, região), itens (combo lista os componentes), totais, **RECEBER NA ENTREGA** com a forma de pagamento e **COBRAR DO CLIENTE** em destaque ("Levar máquina de cartão" / "Levar troco para…"; pedido já pago sai "NÃO COBRAR (PAGO)"). Datas no fuso de Brasília. Modelo de referência: foto do cupom do sistema anterior.

## Gerar o pacote da loja (no servidor)
A chave da unidade é `HMAC-SHA256(PRINT_AGENT_SECRET, slug)`. Gere **dentro do container do app** para o secret não aparecer:

```bash
N=$(docker ps --format '{{.Names}}' | grep hmi9i | head -1)
K=$(docker exec $N node -e 'console.log(require("crypto").createHmac("sha256",process.env.PRINT_AGENT_SECRET).update("matriz").digest("hex"))')
cd print-agent && PRINT_AGENT_KEY=$K bash build-pacote.sh /root/banguelas-print-node.zip
```
O `.zip` (chmod 600) contém a chave no `config.json` — **não publicar nem commitar**. Se o `PRINT_AGENT_SECRET` mudar, gerar chave e pacote de novo. Franquia: trocar `matriz` pelo slug e `ERP_URL` pelo link da franquia.

## Instalar / atualizar na máquina da loja (Windows)
1. Baixar o `.zip` (`scp root@<IP>:/root/banguelas-print-node.zip .` — sem os sinais `<>` e com o ponto final) e **extrair tudo**.
2. Duplo clique em `instalar.bat`. Sem Node.js, ele instala via `winget` (pode pedir permissão); fechar e rodar de novo.
3. O assistente acha a TM-T20, imprime um cupom de teste (1 via), copia o programa para `%LOCALAPPDATA%\BanguelasPrint` e cria o atalho oculto na pasta Inicializar **do usuário logado** (instalar logado como o usuário da máquina da impressora).
4. Atualizar versão: novo `.zip` → `instalar.bat` → opção **1) Reinstalar** (troca o código e reinicia o agente). Desinstalar: opção **2**.
5. Depois do teste, a pasta extraída e o `.zip` podem ser apagados (guardar o `.zip` em local seguro: traz a chave). **Não** apagar `%LOCALAPPDATA%\BanguelasPrint` nem o Node.js.

Log: `%LOCALAPPDATA%\BanguelasPrint\agent.log` (e `erro.log` se o programa falhar). Config: `config.json` (`erpUrl`, `key`, `printerName`, `width`, `type`, `copies`); variáveis de ambiente têm prioridade (`PRINT_COPIES`, `PRINTER_WIDTH`, `RETRY_SECONDS`…).

## Solução de problemas
- **Cupom de teste não sai**: impressora desligada/sem papel/sem driver (precisa aparecer em Configurações → Impressoras e scanners). A mensagem de erro fica na tela do instalador.
- **Pedido novo não imprime**: ver `agent.log` (`[sse] Conectado`?). `401` ⇒ chave errada/desatualizada. Pagamento online só imprime após aprovado.
- **Reimprimir um pedido**: apagar a entrada dele em `printed.json` e reiniciar o agente (ou usar "Imprimir" no painel).
- **`.exe` abre e fecha**: o Windows 11 da loja bloqueia executáveis não assinados (testado até com um `.exe` mínimo) — usar o pacote Node. Smart App Control pode colocar o PowerShell em modo restrito; se o envio RAW falhar por isso, trocar o caminho de envio.
- **Mensagem de `scp` "usage"**: faltou o destino (`.`) ou sobraram os `<>` do exemplo.

## Testado / não testado (2026-10-23)
Testado: fluxo completo contra ERP e impressora simulados (impressão, não duplicar, fila/retry, reinício com pendente, 1/2/3 vias, modo oculto, trava de cópia), e **na loja** o cupom de teste do `instalar.bat` imprimiu. Pendente: pedido real sem intervenção, reinício do PC e a reinstalação com 2 vias.
