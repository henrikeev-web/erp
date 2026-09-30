import { prisma } from "@/lib/prisma";
import { getCurrentUnit } from "@/lib/unit";
import { applyTierPricing, getSessionPricing, productOmitFor } from "@/lib/pricing";
import MenuClient from "@/components/storefront/MenuClient";

export const dynamic = "force-dynamic";

async function getMenuData() {
  const unit = await getCurrentUnit();
  if (!unit) return null;
  const brand = await prisma.brand.findUnique({ where: { id: unit.brandId } });
  if (!brand) return null;
  // Nível de preço da sessão (revendedor logado ou varejo). O preço de revenda só entra na consulta se for revendedor.
  const { tier } = await getSessionPricing(unit.id);
  const omit = productOmitFor(tier);

  const [categories, products, thematicMenus, bannerSlides] = await Promise.all([
    prisma.category.findMany({
      where: { unitId: unit.id, active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.product.findMany({
      where: { unitId: unit.id, active: true },
      omit, // o produto inteiro vai serializado para o navegador
      include: {
        images: { orderBy: { order: "asc" } },
        category: true,
        stockItem: { select: { quantity: true } },
      },
      orderBy: [{ featured: "desc" }, { order: "asc" }, { name: "asc" }],
    }),
    prisma.thematicMenu.findMany({
      where: {
        unitId: unit.id,
        active: true,
        OR: [
          { validTo: null },
          { validTo: { gte: new Date() } },
        ],
      },
      include: {
        products: {
          include: {
            product: {
              omit,
              include: { images: { orderBy: { order: "asc" } }, stockItem: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    }),
    (prisma.bannerSlide as any).findMany({
      where: { unitId: unit.id, active: true },
      orderBy: { order: "asc" },
    }),
  ]);

  // Converte para o preço do nível e REMOVE resalePrice antes de serializar para o navegador
  return {
    brand, categories, bannerSlides,
    pricingTier: tier,
    products: products.map((p: any) => applyTierPricing(p, tier)),
    thematicMenus: thematicMenus.map((m: any) => ({
      ...m,
      products: m.products.map((tp: any) => ({ ...tp, product: applyTierPricing(tp.product, tier) })),
    })),
  };
}

export default async function CardapioPage() {
  const data = await getMenuData();

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Cardápio não disponível</p>
      </div>
    );
  }

  return <MenuClient {...data} />;
}
