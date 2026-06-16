import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function getCustomerSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return {
      customer: null,
      error: NextResponse.json({ error: "Não autorizado" }, { status: 401 }),
    };
  }
  return { customer: session.user, error: null };
}
