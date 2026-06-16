import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

export const runtime = "nodejs";

const VALID_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 8 * 1024 * 1024;

const PRESETS = {
  desktop: { width: 1400, height: 480 },
  mobile: { width: 800, height: 600 },
};

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as "desktop" | "mobile" | null;
    const preset = type === "mobile" ? PRESETS.mobile : PRESETS.desktop;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    if (!VALID_TYPES.includes(file.type)) return NextResponse.json({ error: "Formato inválido. Use JPEG, PNG ou WEBP." }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "Arquivo muito grande. Máximo 8 MB." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(buffer)
      .resize(preset.width, preset.height, { fit: "cover", withoutEnlargement: false })
      .webp({ quality: 85 })
      .toBuffer();

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const dir = join(process.cwd(), "public", "uploads", "banners");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), optimized);

    return NextResponse.json({ url: `/uploads/banners/${filename}` });
  } catch (err) {
    console.error("[upload-banner]", err);
    return NextResponse.json({ error: "Erro ao processar imagem" }, { status: 500 });
  }
}
