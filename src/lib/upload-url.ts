import { resolve, sep } from "path";

/**
 * URLs de imagem guardadas no banco (produto, banner). Só valem:
 *  - arquivos que o próprio sistema enviou: /uploads/products|banners/<nome simples>.<ext imagem>
 *  - links https externos (nunca viram caminho de arquivo)
 * Qualquer outra coisa (../, javascript:, data:, caminho absoluto…) é recusada.
 */
const UPLOAD_RE = /^\/uploads\/(products|banners)\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(webp|jpg|jpeg|png|gif)$/;
const UPLOAD_ROOT = resolve(process.cwd(), "public", "uploads");

export function isUploadUrl(url: unknown): url is string {
  return typeof url === "string" && UPLOAD_RE.test(url) && !url.includes("..");
}

export function isImageUrl(url: unknown): url is string {
  if (isUploadUrl(url)) return true;
  if (typeof url !== "string" || url.length > 2000) return false;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

/** Link de banner: caminho interno ("/cardapio") ou https. Bloqueia javascript:, data:, //host e "/\host". */
export function isSafeLink(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2000) return false;
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\");
  try { return new URL(url).protocol === "https:"; } catch { return false; }
}

/** Caminho no disco de um upload nosso, garantidamente dentro de public/uploads. null = não apagar. */
export function uploadFilePath(url: unknown): string | null {
  if (!isUploadUrl(url)) return null;
  const file = resolve(process.cwd(), "public", url.replace(/^\//, ""));
  return file.startsWith(UPLOAD_ROOT + sep) ? file : null;
}
