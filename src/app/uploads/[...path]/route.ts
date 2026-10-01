import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, resolve, sep, extname } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O Next só serve de public/ o que existia no start; uploads feitos depois caem aqui.
const ROOT = resolve(process.cwd(), "public", "uploads");

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const file = resolve(join(ROOT, ...path));
  const type = TYPES[extname(file).toLowerCase()];

  if (!file.startsWith(ROOT + sep) || !type) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const data = await readFile(file);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
