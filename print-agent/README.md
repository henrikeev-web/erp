# Banguelas Print Agent — instalação no Windows

Imprime sozinho cada pedido na impressora térmica da loja.

Impressora da loja: **Epson TM-T20** (ESC/POS, bobina de 80 mm → `PRINTER_WIDTH=48`, `PRINTER_TYPE=epson`). O cupom segue o modelo do sistema anterior (título, cliente, endereço, itens, totais, "RECEBER NA ENTREGA" e "COBRAR DO CLIENTE" em destaque).

**Quando imprime:** pagamento na entrega (dinheiro, maquininha, PIX na entrega, faturado) imprime assim que o pedido chega. Pagamento online imprime só depois que o pagamento é aprovado. Cada pedido sai uma vez. Se a impressora estiver desligada ou sem papel, o agente tenta de novo a cada 20 s até conseguir (inclusive depois de reiniciar o computador).

## 1. Compartilhar a impressora
1. Instale o driver da impressora normalmente (o do fabricante).
2. Configurações → Impressoras → sua térmica → Propriedades → aba **Compartilhamento** → marcar **Compartilhar** e dar um nome curto, sem espaços, ex.: `BANGUELAS`.

## 2. Instalar o agente
1. Instale o **Node.js 20 ou 22 (LTS)**.
2. Copie a pasta `print-agent` para `C:\banguelas-print`.
3. Abra o terminal nessa pasta e rode `npm install`.
4. Copie `.env.example` para `.env` e preencha:
   - `ERP_URL`: endereço da unidade (matriz: `https://cardapio.banguelas.com.br`; franquia: o link dela).
   - `PRINT_AGENT_KEY`: gerada no servidor com `npx tsx scripts/print-agent-key.ts <slug-da-unidade>`.
   - `PRINTER_INTERFACE=share:BANGUELAS` (o nome do passo 1).
   - `PRINTER_WIDTH`: `32` (bobina 58 mm) ou `48` (80 mm).

## 3. Testar
`node index.js` — deve aparecer `[sse] Conectado.`. Faça um pedido de teste com pagamento na entrega: o cupom sai na hora.

## 4. Subir junto com o Windows
A impressora está instalada no usuário **Carol**, então o agente roda como ela (um serviço SYSTEM pode não enxergar a impressora). Com o teste ok, crie a tarefa que inicia quando a Carol entra no Windows (pede a senha dela):

```
schtasks /Create /TN "Banguelas Print" /SC ONLOGON /RU Carol /RL LIMITED /TR "cmd /c cd /d C:\banguelas-print && node index.js >> agent.log 2>&1"
```

(ou `npm i -g pm2 pm2-windows-startup` e `pm2 start index.js --name banguelas-print`).

## Arquivos de estado
`printed.json` (pedidos já impressos) e `pending.json` (aguardando a impressora) ficam na pasta do agente. Para reimprimir um pedido, apague a entrada dele em `printed.json` e reinicie.

## Limitações
- Pedido que chega enquanto o agente/PC está desligado **não** é impresso depois (o agente só recebe eventos em tempo real). Use o botão "Imprimir" do painel nesses casos.
- Acentos usam a tabela PC860; se sair caractere trocado, ajuste a tabela do modelo da impressora.
