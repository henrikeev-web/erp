import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCurrentUnit } from "@/lib/unit";
import AvisosClient from "@/components/admin/AvisosClient";

export const dynamic = "force-dynamic";

// Avisos para as franquias: só administrador da MATRIZ (as APIs também conferem)
export default async function AvisosPage() {
  const session = await getServerSession(authOptions);
  const unit = await getCurrentUnit();
  if (!session?.user || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role) || unit?.type !== "HQ") redirect("/admin");
  return <AvisosClient />;
}
