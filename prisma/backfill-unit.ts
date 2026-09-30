/**
 * Cria a unidade matriz e associa todos os registros existentes a ela.
 * Idempotente: só toca linhas com unitId nulo. Rodar entre os dois passos
 * de `prisma db push` (unitId opcional → obrigatório).
 *   npx tsx prisma/backfill-unit.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma: any = new (PrismaClient as any)({ adapter });

const HQ_SLUG = "matriz";

async function main() {
  const brand = await prisma.brand.findFirst({ orderBy: { createdAt: "asc" } });
  if (!brand) throw new Error("Nenhuma Brand encontrada — rode o seed antes.");

  const hq = await prisma.unit.upsert({
    where: { slug: HQ_SLUG },
    update: {},
    create: { brandId: brand.id, type: "HQ", name: brand.name, slug: HQ_SLUG, city: "São José do Rio Preto", state: "SP" },
  });

  const models = ["whatsAppSession", "user", "customer", "deliveryZone", "category", "product", "thematicMenu", "bannerSlide", "order", "coupon"];
  for (const m of models) {
    const r = await prisma[m].updateMany({ where: { unitId: null }, data: { unitId: hq.id } });
    console.log(`${m}: ${r.count} linhas associadas à matriz`);
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
