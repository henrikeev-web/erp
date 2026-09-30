import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getCurrentUnit } from "@/lib/unit";

// Sessão de cliente válida SOMENTE na unidade em que ele se cadastrou: o cookie pode ser
// compartilhado entre subdomínios (login Google), então a unidade do host é conferida aqui.
export async function getCustomerSession() {
  const session = await getServerSession(authOptions);
  const unit = await getCurrentUnit();
  if (!session?.user || session.user.role !== "CUSTOMER" || !unit || session.user.unitId !== unit.id) {
    return {
      customer: null,
      error: NextResponse.json({ error: "Não autorizado" }, { status: 401 }),
    };
  }
  return { customer: session.user, error: null };
}
