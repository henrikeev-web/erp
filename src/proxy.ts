import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { UNIT_HEADER, slugFromHost } from "@/lib/unit-host";

// Resolve a unidade pelo host e injeta em x-unit-slug.
// Sempre sobrescreve o header: o cliente não pode forjar a unidade.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(UNIT_HEADER, slugFromHost(request.headers.get("host") ?? ""));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/).*)"],
};
