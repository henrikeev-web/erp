import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCurrentUnit } from "@/lib/unit";
import ReposicaoClient from "@/components/admin/ReposicaoClient";

export const dynamic = "force-dynamic";

// Reposição: só o administrador de uma FRANQUIA (as APIs também conferem)
export default async function ReposicaoPage() {
  const session = await getServerSession(authOptions);
  const unit = await getCurrentUnit();
  if (!session?.user || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role) || unit?.type !== "FRANCHISE") redirect("/admin");
  return <ReposicaoClient />;
}
