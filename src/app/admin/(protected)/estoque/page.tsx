import { prisma } from "@/lib/prisma";
import { getCurrentUnit } from "@/lib/unit";
import { Package, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import StockActions from "@/components/admin/StockActions";

export default async function EstoquePage() {
  const unit = await getCurrentUnit();
  if (!unit) return <div className="p-8">Unidade não encontrada</div>;

  const stockItems = await prisma.stockItem.findMany({
    where: { product: { unitId: unit.id } },
    include: {
      product: {
        include: { images: { where: { isMain: true }, take: 1 }, category: true },
      },
      movements: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { product: { name: "asc" } },
  });

  const lowStock = stockItems.filter(i => i.quantity <= i.minQuantity);
  const outOfStock = stockItems.filter(i => i.quantity === 0);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Estoque</h1>
        <p className="text-zinc-500 text-sm">{stockItems.length} produto{stockItems.length !== 1 ? "s" : ""} gerenciados</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center mb-2">
              <Package className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-2xl font-bold">{stockItems.length - lowStock.length}</p>
            <p className="text-xs text-zinc-500">Estoque OK</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="pt-5 pb-4">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-600">{lowStock.length}</p>
            <p className="text-xs text-zinc-500">Estoque baixo</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="pt-5 pb-4">
            <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center mb-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-red-500">{outOfStock.length}</p>
            <p className="text-xs text-zinc-500">Sem estoque</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
        <div className="divide-y divide-zinc-50">
          {stockItems.map((item) => {
            const isLow = item.quantity <= item.minQuantity;
            const isEmpty = item.quantity === 0;

            return (
              <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-xl bg-orange-50 overflow-hidden shrink-0">
                  {item.product.images[0] ? (
                    <img src={item.product.images[0].url} alt={item.product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-orange-200" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{item.product.name}</p>
                  {item.product.category && (
                    <p className="text-xs text-zinc-400">{item.product.category.name}</p>
                  )}
                </div>

                <div className="text-right mr-4">
                  <p className={`text-xl font-bold ${isEmpty ? "text-red-500" : isLow ? "text-amber-500" : "text-zinc-900"}`}>
                    {item.quantity}
                  </p>
                  <p className="text-xs text-zinc-400">{item.unit} (mín: {item.minQuantity})</p>
                </div>

                <StockActions stockItemId={item.id} productName={item.product.name} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
