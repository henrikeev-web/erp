import { NextResponse } from "next/server";
import { requireHQAdmin } from "@/lib/api-auth";
import { evaluateAllFranchises } from "@/lib/awards";

// "Reavaliar agora": confere todas as franquias (a conferência também roda a cada pedido da franquia)
export async function POST() {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ granted: await evaluateAllFranchises(auth.unit.brandId) });
}
