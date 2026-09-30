import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCurrentUnit } from "@/lib/unit";
import RedeClient from "@/components/admin/RedeClient";

export const dynamic = "force-dynamic";

// Dashboard da rede: só administrador da MATRIZ (a API também confere)
export default async function RedePage() {
  const session = await getServerSession(authOptions);
  const unit = await getCurrentUnit();
  if (!session?.user || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role) || unit?.type !== "HQ") redirect("/admin");
  return <RedeClient />;
}
