import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import EntregadoresClient from "@/components/admin/EntregadoresClient";

export const dynamic = "force-dynamic";

// Cadastro e relatório de entregadores têm valores a pagar: só ADMIN (as APIs também conferem)
export default async function EntregadoresPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) redirect("/admin");
  return <EntregadoresClient />;
}
