import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LOGIN_COOKIE, originForUnit, parseLoginCookie } from "@/lib/google-login";

export const dynamic = "force-dynamic";

// Volta do Google (AUTH_HOST): devolve o cliente para a unidade de origem.
// O destino é reconstruído no servidor (origem da unidade + caminho validado), nunca de um parâmetro.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const intent = parseLoginCookie(req.cookies.get(LOGIN_COOKIE)?.value);
  const origin = originForUnit(intent.unit, req.nextUrl.origin);
  const role = session?.user?.role;

  let target: URL;
  if (role === "CUSTOMER") target = new URL(intent.returnTo, origin);
  else if (role === "CUSTOMER_PENDING") {
    target = new URL("/minha-conta/completar-cadastro", origin);
    target.searchParams.set("next", intent.returnTo);
  } else target = new URL("/minha-conta/login?erro=google", origin);

  const res = NextResponse.redirect(target);
  res.cookies.delete(LOGIN_COOKIE);
  return res;
}
