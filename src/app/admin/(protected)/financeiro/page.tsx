import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import FinanceiroClient from "@/components/admin/financeiro/FinanceiroClient";

export const dynamic = "force-dynamic";

// Financeiro é restrito a ADMIN (as APIs também conferem; aqui evita abrir a tela vazia para o STAFF)
export default async function FinanceiroPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) redirect("/admin");
  return <FinanceiroClient />;
}
