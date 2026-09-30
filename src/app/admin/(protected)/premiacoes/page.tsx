import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCurrentUnit } from "@/lib/unit";
import PremiacoesClient from "@/components/admin/PremiacoesClient";

export const dynamic = "force-dynamic";

// Matriz: só administrador gerencia. Franquia: qualquer perfil vê o próprio progresso. A API decide o conteúdo.
export default async function PremiacoesPage() {
  const session = await getServerSession(authOptions);
  const unit = await getCurrentUnit();
  if (!session?.user || !unit) redirect("/admin");
  if (unit.type === "HQ" && !["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) redirect("/admin");
  return <PremiacoesClient />;
}
