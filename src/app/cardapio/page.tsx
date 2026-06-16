import { prisma } from "@/lib/prisma";
import MenuClient from "@/components/storefront/MenuClient";

export const dynamic = "force-dynamic";

async function getMenuData() {
  const brand = await prisma.brand.findUnique({ where: { slug: "banguelas" } });
  if (!brand) return null;

  const [categories, products, thematicMenus, bannerSlides] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.product.findMany({
      where: { brandId: brand.id, active: true },
      include: {
        images: { orderBy: { order: "asc" } },
        category: true,
        stockItem: { select: { quantity: true } },
      },
      orderBy: [{ featured: "desc" }, { order: "asc" }, { name: "asc" }],
    }),
    prisma.thematicMenu.findMany({
      where: {
        brandId: brand.id,
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
              include: { images: { orderBy: { order: "asc" } }, stockItem: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    }),
    (prisma.bannerSlide as any).findMany({
      where: { brandId: brand.id, active: true },
      orderBy: { order: "asc" },
    }),
  ]);

  return { brand, categories, products, thematicMenus, bannerSlides };
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
