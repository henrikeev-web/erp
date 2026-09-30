import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHQAdmin } from "@/lib/api-auth";
import { syncCatalogToUnit } from "@/lib/catalog-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "Sincronizar agora": copia o que falta e atualiza o conteúdo do catálogo da matriz nesta franquia.
// (O mesmo acontece sozinho a cada alteração do catálogo na matriz.)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHQAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const unit = await prisma.unit.findFirst({ where: { id, brandId: auth.unit.brandId, type: "FRANCHISE" }, select: { id: true } });
  if (!unit) return NextResponse.json({ error: "Franquia não encontrada" }, { status: 404 });
  try {
    return NextResponse.json(await syncCatalogToUnit(auth.unit.id, id));
  } catch (e) {
    console.error("[franquias/catalogo]", e);
    return NextResponse.json({ error: "Erro ao sincronizar o catálogo" }, { status: 500 });
  }
}
