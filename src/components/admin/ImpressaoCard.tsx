import { Download, Printer } from "lucide-react";

// Download do pacote do agente de impressão (cupom automático) já configurado para esta unidade.
export default function ImpressaoCard() {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Printer className="w-5 h-5 text-orange-500" />
        <h2 className="font-semibold text-zinc-900">Impressão automática de pedidos</h2>
      </div>
      <p className="text-xs text-zinc-500">
        Baixe o pacote e instale no computador da impressora (Epson TM-T20). Depois, todo pedido novo imprime sozinho em 2 vias.
        Para atualizar uma instalação antiga, baixe de novo e use a opção &quot;Reinstalar&quot;.
      </p>
      <ol className="text-xs text-zinc-600 list-decimal pl-5 space-y-0.5">
        <li>Clique em baixar e extraia TODO o .zip (botão direito &gt; Extrair tudo).</li>
        <li>Dê dois cliques em <b>instalar.bat</b> e siga a janela preta (imprime um cupom de teste).</li>
      </ol>
      <a href="/api/impressao/pacote" download
        className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
        <Download className="w-4 h-4" /> Baixar pacote de impressão
      </a>
      <p className="text-xs text-amber-600">O arquivo contém a chave da sua unidade: não compartilhe nem envie para outras pessoas.</p>
    </div>
  );
}
