import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCurrentUnit } from "@/lib/unit";
import FranquiasClient from "@/components/admin/FranquiasClient";

export const dynamic = "force-dynamic";

// Gestão da rede: só administrador da MATRIZ (as APIs também conferem)
export default async function FranquiasPage() {
  const session = await getServerSession(authOptions);
  const unit = await getCurrentUnit();
  if (!session?.user || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role) || unit?.type !== "HQ") redirect("/admin");
  return <Suspense><FranquiasClient /></Suspense>;
}
