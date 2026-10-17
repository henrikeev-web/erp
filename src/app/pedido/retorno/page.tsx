import { prisma } from "@/lib/prisma";
import { getCurrentUnit } from "@/lib/unit";
import { confirmOnlinePayment } from "@/lib/payment-confirm";

export const dynamic = "force-dynamic";

type Params = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// Para onde a InfinitePay devolve o cliente depois de pagar (?order_nsu&transaction_nsu&slug&receipt_url&capture_method).
// A URL não prova nada: o pagamento é confirmado perguntando à InfinitePay (o webhook pode ter chegado antes ou depois).
export default async function RetornoPagamento({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams;
  const orderId = one(q.order_nsu);
  const transactionNsu = one(q.transaction_nsu);
  const slug = one(q.slug);
  const unit = await getCurrentUnit();

  let state: "paid" | "pending" | "unknown" = "unknown";
  let number: number | null = null;

  if (unit && orderId && orderId.length <= 64) {
    const result = transactionNsu && slug && transactionNsu.length <= 128 && slug.length <= 128
      ? await confirmOnlinePayment({ orderId, unitId: unit.id, transactionNsu, slug })
      : null;
    const order = await prisma.order.findFirst({ where: { id: orderId, unitId: unit.id }, select: { number: true, payment: { select: { status: true } } } });
    if (order) {
      number = order.number;
      state = result === "PAID" || result === "ALREADY_PAID" || order.payment?.status === "PAID" ? "paid" : "pending";
    }
  }

  const box = { maxWidth: 440, margin: "0 auto", padding: "56px 20px", textAlign: "center" as const, fontFamily: "'Poppins',sans-serif", color: "#4A3526" };
  const btn = { display: "inline-block", marginTop: 20, background: "#F26C21", color: "#fff", borderRadius: 12, padding: "12px 24px", fontWeight: 700, textDecoration: "none" };

  return (
    <div style={{ minHeight: "100vh", background: "#FBF6EC" }}>
      <div style={box}>
        {state === "paid" && (<>
          <div style={{ fontSize: 56 }}>✅</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 6px" }}>Pagamento confirmado!</h1>
          <p>Pedido <strong>#{number}</strong> recebido. Já estamos preparando tudo com carinho.</p>
        </>)}
        {state === "pending" && (<>
          <div style={{ fontSize: 56 }}>⏳</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 6px" }}>Aguardando confirmação</h1>
          <p>Pedido <strong>#{number}</strong>. Ainda não recebemos a confirmação do pagamento. Se você acabou de pagar, ela costuma chegar em instantes.</p>
          <a href={`?order_nsu=${encodeURIComponent(orderId ?? "")}&transaction_nsu=${encodeURIComponent(transactionNsu ?? "")}&slug=${encodeURIComponent(slug ?? "")}`} style={btn}>Verificar novamente</a>
        </>)}
        {state === "unknown" && (<>
          <div style={{ fontSize: 56 }}>🤔</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 6px" }}>Pedido não encontrado</h1>
          <p>Não conseguimos identificar este pagamento. Se você pagou, fale com a gente pelo WhatsApp.</p>
        </>)}
        <div><a href="/cardapio" style={{ ...btn, background: "transparent", color: "#F26C21", border: "2px solid #F26C21" }}>Voltar ao cardápio</a></div>
      </div>
    </div>
  );
}
