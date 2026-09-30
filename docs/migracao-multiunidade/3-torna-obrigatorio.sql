-- DropForeignKey
ALTER TABLE "BannerSlide" DROP CONSTRAINT "BannerSlide_unitId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_unitId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryZone" DROP CONSTRAINT "DeliveryZone_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_unitId_fkey";

-- DropForeignKey
ALTER TABLE "ThematicMenu" DROP CONSTRAINT "ThematicMenu_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_unitId_fkey";

-- AlterTable
ALTER TABLE "BannerSlide" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DeliveryZone" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ThematicMenu" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Coupon" ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "WhatsAppSession" ALTER COLUMN "unitId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "BannerSlide" ADD CONSTRAINT "BannerSlide_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThematicMenu" ADD CONSTRAINT "ThematicMenu_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

