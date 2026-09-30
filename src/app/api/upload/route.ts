import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { requireStaff } from "@/lib/api-auth";

export const runtime = "nodejs";

const VALID_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Formato inválido. Use JPEG, PNG ou WEBP." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande. Máximo 5 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(buffer)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const dir = join(process.cwd(), "public", "uploads", "products");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), optimized);

    return NextResponse.json({ url: `/uploads/products/${filename}` });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json({ error: "Erro ao processar imagem" }, { status: 500 });
  }
}
