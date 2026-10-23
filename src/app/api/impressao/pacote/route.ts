import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { requireStaff, printAgentKey } from "@/lib/api-auth";
import { originForUnit, publicOrigin } from "@/lib/google-login";

const AGENT_DIR = join(process.cwd(), "print-agent");
const FILES: [src: string, dest: string][] = [
  ["index.js", "index.js"],
  ["package.json", "package.json"],
  ["package-lock.json", "package-lock.json"],
  ["instalar.bat", "instalar.bat"],
  ["LEIAME-NODE.txt", "LEIAME.txt"],
];

// Parte fixa do pacote (código + node_modules de produção, instalados no build da imagem): lida uma vez.
let base: Record<string, Uint8Array> | null = null;

function walk(dir: string, prefix: string, out: Record<string, Uint8Array>) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, `${prefix}/${e.name}`, out);
    else if (e.isFile()) out[`${prefix}/${e.name}`] = readFileSync(full);
  }
}

function loadBase(): Record<string, Uint8Array> {
  if (base) return base;
  const files: Record<string, Uint8Array> = {};
  for (const [src, dest] of FILES) files[`banguelas-print/${dest}`] = readFileSync(join(AGENT_DIR, src));
  walk(join(AGENT_DIR, "node_modules"), "banguelas-print/node_modules", files);
  return (base = files);
}

/**
 * Pacote de instalação da impressão automática, já com a chave e o endereço DESTA unidade.
 * Só administrador (a chave dá acesso aos pedidos da unidade). Mesmo conteúdo do build-pacote.sh.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(["SUPER_ADMIN", "ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const key = printAgentKey(auth.unit.slug);
  if (!key) return NextResponse.json({ error: "Impressão automática não configurada neste servidor" }, { status: 503 });

  let files: Record<string, Uint8Array>;
  try {
    files = loadBase();
  } catch {
    return NextResponse.json({ error: "Pacote de impressão indisponível neste servidor" }, { status: 503 });
  }

  const erpUrl = originForUnit(auth.unit.slug, publicOrigin(req.headers, req.nextUrl.origin));
  const config = { erpUrl, key, width: 48, type: "epson" };
  const zip = zipSync({ ...files, "banguelas-print/config.json": strToU8(JSON.stringify(config, null, 2)) }, { level: 6 });

  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="banguelas-print-${auth.unit.slug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
