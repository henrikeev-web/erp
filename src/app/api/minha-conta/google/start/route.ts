import { NextRequest, NextResponse } from "next/server";
import { HQ_SLUG, UNIT_HEADER, isValidSlug } from "@/lib/unit-host";
import { getUnitBySlug } from "@/lib/unit";
import { LOGIN_COOKIE, LOGIN_COOKIE_MAX_AGE, publicOrigin, safeReturnPath } from "@/lib/google-login";

export const dynamic = "force-dynamic";

// Início do login Google. O callback do OAuth só existe no AUTH_HOST, então:
//  - numa unidade (cidade.banguelas.com.br): manda para o AUTH_HOST levando o slug da unidade;
//  - no AUTH_HOST: guarda a unidade de origem num cookie curto e abre o login Google.
export async function GET(req: NextRequest) {
  const returnTo = safeReturnPath(req.nextUrl.searchParams.get("returnTo"));
  // NÃO use req.url para montar redirecionamentos: atrás do proxy ele vem como localhost:<porta>
  const origin = publicOrigin(req.headers, req.nextUrl.origin);
  const authHost = process.env.AUTH_HOST;
  const host = req.headers.get("host") ?? "";
  const onAuthHost = !authHost || host === authHost || !process.env.BASE_DOMAIN || !host.endsWith(process.env.BASE_DOMAIN);

  // Na unidade a origem é a do próprio host (header do proxy). No AUTH_HOST vem por query, validada abaixo.
  const slug = onAuthHost
    ? (req.nextUrl.searchParams.get("unit") ?? req.headers.get(UNIT_HEADER) ?? HQ_SLUG)
    : (req.headers.get(UNIT_HEADER) ?? HQ_SLUG);

  if (!onAuthHost) {
    const url = new URL(`https://${authHost}/api/minha-conta/google/start`);
    url.searchParams.set("unit", slug);
    url.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(url);
  }

  const unit = isValidSlug(slug) ? await getUnitBySlug(slug) : null;
  if (!unit) return NextResponse.redirect(new URL("/minha-conta/login?erro=unidade", origin));

  const res = NextResponse.redirect(new URL("/minha-conta/login/google", origin));
  res.cookies.set(LOGIN_COOKIE, JSON.stringify({ unit: unit.slug, returnTo }), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https:"),
    path: "/",
    maxAge: LOGIN_COOKIE_MAX_AGE,
  });
  return res;
}
