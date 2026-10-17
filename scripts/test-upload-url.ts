import { isImageUrl, isSafeLink, isUploadUrl, uploadFilePath } from "../src/lib/upload-url";
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); };
t("upload válido", isUploadUrl("/uploads/products/1780-abc.webp"), true);
t("banner válido", isUploadUrl("/uploads/banners/x.png"), true);
for (const u of ["/uploads/../../certs/cert.pfx", "/uploads/products/../../../.env", "/uploads/products/..%2f..%2f.env", "/uploads/products/a/b.webp", "/uploads/other/a.webp", "/uploads/products/a.svg", "/uploads/products/.webp", "/etc/passwd", "uploads/products/a.webp", "/uploads/products/a.webp\0.png", "/uploads/products/a b.webp"])
  t(`recusa ${JSON.stringify(u)}`, isUploadUrl(u), false);
t("caminho no disco só dentro de uploads", uploadFilePath("/uploads/../../.env"), null);
t("caminho válido resolve", uploadFilePath("/uploads/products/a.webp")?.endsWith("/public/uploads/products/a.webp"), true);
t("https externo é imagem", isImageUrl("https://cdn.exemplo.com/a.jpg"), true);
t("https externo nunca vira arquivo", uploadFilePath("https://cdn.exemplo.com/a.jpg"), null);
for (const u of ["javascript:alert(1)", "data:image/png;base64,AA", "http://x.com/a.png", "//evil.com/a.png", "file:///etc/passwd"]) t(`imagem recusa ${u}`, isImageUrl(u), false);
for (const u of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "//evil.com", "/\\evil.com", "data:text/html,x", "http://x.com"]) t(`link recusa ${u}`, isSafeLink(u), false);
for (const u of ["/cardapio", "/cardapio?cat=1", "https://banguelas.com.br/promo"]) t(`link aceita ${u}`, isSafeLink(u), true);
console.log(bad ? `\n${bad} FALHA(S)` : "\ntudo ok");
process.exit(bad ? 1 : 0);
