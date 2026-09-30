-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('HQ', 'FRANCHISE');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RETAIL', 'RESELLER', 'FRANCHISEE');

-- CreateEnum
CREATE TYPE "OrderPriceTier" AS ENUM ('RETAIL', 'RESELLER', 'FRANCHISE');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('SIMPLE', 'COMBO');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('MANUAL', 'RECURRING', 'ORDER', 'COURIER');

-- CreateEnum
CREATE TYPE "RecurrenceUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "AnnouncementKind" AS ENUM ('POPUP', 'NOTICE');

-- CreateEnum
CREATE TYPE "AnnouncementLevel" AS ENUM ('INFO', 'SUCCESS', 'WARNING');

-- CreateEnum
CREATE TYPE "AwardMetric" AS ENUM ('ORDERS', 'SALES');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'INVOICE';

-- DropIndex
DROP INDEX "Customer_phone_key";

-- DropIndex
DROP INDEX "Customer_cpf_key";

-- DropIndex
DROP INDEX "Category_slug_key";

-- DropIndex
DROP INDEX "Product_sku_key";

-- DropIndex
DROP INDEX "Order_brandId_number_key";

-- DropIndex
DROP INDEX "Coupon_code_key";

-- DropIndex
DROP INDEX "WhatsAppSession_phone_key";

-- AlterTable
ALTER TABLE "BannerSlide" ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "franchiseUnitId" TEXT,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "type" "CustomerType" NOT NULL DEFAULT 'RETAIL',
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "courierFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "sourceCategoryId" TEXT,
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "comboSize" INTEGER,
ADD COLUMN     "franchisePrice" DOUBLE PRECISION,
ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'SIMPLE',
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "packHeightCm" DOUBLE PRECISION,
ADD COLUMN     "packLengthCm" DOUBLE PRECISION,
ADD COLUMN     "packWeightG" INTEGER,
ADD COLUMN     "packWidthCm" DOUBLE PRECISION,
ADD COLUMN     "priceCustom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resalePrice" DOUBLE PRECISION,
ADD COLUMN     "sourceProductId" TEXT,
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "ThematicMenu" ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courierAssignedAt" TIMESTAMP(3),
ADD COLUMN     "courierFee" DOUBLE PRECISION,
ADD COLUMN     "courierId" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "discountNote" TEXT,
ADD COLUMN     "invoiceDays" INTEGER,
ADD COLUMN     "priceTier" "OrderPriceTier" NOT NULL DEFAULT 'RETAIL',
ADD COLUMN     "restockedAt" TIMESTAMP(3),
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppSession" ADD COLUMN     "unitId" TEXT;

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "type" "UnitType" NOT NULL DEFAULT 'FRANCHISE',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "EntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'OPEN',
    "paidAt" DATE,
    "paidAmount" DOUBLE PRECISION,
    "payMethod" TEXT,
    "notes" TEXT,
    "supplierId" TEXT,
    "customerId" TEXT,
    "costCenterId" TEXT,
    "recurringId" TEXT,
    "orderId" TEXT,
    "courierId" TEXT,
    "installmentNumber" INTEGER,
    "installmentTotal" INTEGER,
    "source" "EntrySource" NOT NULL DEFAULT 'MANUAL',
    "sourceKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringEntry" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "EntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "every" INTEGER NOT NULL DEFAULT 1,
    "period" "RecurrenceUnit" NOT NULL DEFAULT 'MONTH',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "supplierId" TEXT,
    "customerId" TEXT,
    "costCenterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Courier" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "pixKey" TEXT,
    "document" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Courier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboItem" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "maxQty" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemComponent" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderItemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "AnnouncementKind" NOT NULL DEFAULT 'NOTICE',
    "level" "AnnouncementLevel" NOT NULL DEFAULT 'INFO',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allUnits" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementTarget" (
    "announcementId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "AnnouncementTarget_pkey" PRIMARY KEY ("announcementId","unitId")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" "AwardMetric" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "reward" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardGrant" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwardGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_slug_key" ON "Unit"("slug");

-- CreateIndex
CREATE INDEX "Supplier_unitId_idx" ON "Supplier"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_unitId_document_key" ON "Supplier"("unitId", "document");

-- CreateIndex
CREATE INDEX "CostCenter_unitId_idx" ON "CostCenter"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_unitId_name_key" ON "CostCenter"("unitId", "name");

-- CreateIndex
CREATE INDEX "FinancialEntry_unitId_type_status_dueDate_idx" ON "FinancialEntry"("unitId", "type", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_unitId_sourceKey_key" ON "FinancialEntry"("unitId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_recurringId_dueDate_key" ON "FinancialEntry"("recurringId", "dueDate");

-- CreateIndex
CREATE INDEX "RecurringEntry_unitId_active_idx" ON "RecurringEntry"("unitId", "active");

-- CreateIndex
CREATE INDEX "Courier_unitId_active_idx" ON "Courier"("unitId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Courier_unitId_phone_key" ON "Courier"("unitId", "phone");

-- CreateIndex
CREATE INDEX "ComboItem_comboId_idx" ON "ComboItem"("comboId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboItem_comboId_productId_key" ON "ComboItem"("comboId", "productId");

-- CreateIndex
CREATE INDEX "OrderItemComponent_orderItemId_idx" ON "OrderItemComponent"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemComponent_productId_idx" ON "OrderItemComponent"("productId");

-- CreateIndex
CREATE INDEX "Announcement_brandId_active_idx" ON "Announcement"("brandId", "active");

-- CreateIndex
CREATE INDEX "AnnouncementRead_unitId_idx" ON "AnnouncementRead"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "Award_brandId_active_idx" ON "Award"("brandId", "active");

-- CreateIndex
CREATE INDEX "AwardGrant_unitId_idx" ON "AwardGrant"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "AwardGrant_awardId_unitId_key" ON "AwardGrant"("awardId", "unitId");

-- CreateIndex
CREATE INDEX "BannerSlide_unitId_idx" ON "BannerSlide"("unitId");

-- CreateIndex
CREATE INDEX "User_unitId_idx" ON "User"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_franchiseUnitId_key" ON "Customer"("franchiseUnitId");

-- CreateIndex
CREATE INDEX "Customer_unitId_idx" ON "Customer"("unitId");

-- CreateIndex
CREATE INDEX "Customer_unitId_type_idx" ON "Customer"("unitId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_unitId_phone_key" ON "Customer"("unitId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_unitId_cpf_key" ON "Customer"("unitId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_unitId_googleId_key" ON "Customer"("unitId", "googleId");

-- CreateIndex
CREATE INDEX "DeliveryZone_unitId_idx" ON "DeliveryZone"("unitId");

-- CreateIndex
CREATE INDEX "Category_unitId_idx" ON "Category"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_unitId_slug_key" ON "Category"("unitId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_unitId_sourceCategoryId_key" ON "Category"("unitId", "sourceCategoryId");

-- CreateIndex
CREATE INDEX "Product_unitId_idx" ON "Product"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_unitId_sku_key" ON "Product"("unitId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_unitId_sourceProductId_key" ON "Product"("unitId", "sourceProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_unitId_barcode_key" ON "Product"("unitId", "barcode");

-- CreateIndex
CREATE INDEX "ThematicMenu_unitId_idx" ON "ThematicMenu"("unitId");

-- CreateIndex
CREATE INDEX "Order_unitId_courierId_deliveredAt_idx" ON "Order"("unitId", "courierId", "deliveredAt");

-- CreateIndex
CREATE INDEX "Order_unitId_idx" ON "Order"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_unitId_number_key" ON "Order"("unitId", "number");

-- CreateIndex
CREATE INDEX "Coupon_unitId_idx" ON "Coupon"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_unitId_code_key" ON "Coupon"("unitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_unitId_phone_key" ON "WhatsAppSession"("unitId", "phone");

-- AddForeignKey
ALTER TABLE "BannerSlide" ADD CONSTRAINT "BannerSlide_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_franchiseUnitId_fkey" FOREIGN KEY ("franchiseUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThematicMenu" ADD CONSTRAINT "ThematicMenu_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEntry" ADD CONSTRAINT "RecurringEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEntry" ADD CONSTRAINT "RecurringEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEntry" ADD CONSTRAINT "RecurringEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEntry" ADD CONSTRAINT "RecurringEntry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Courier" ADD CONSTRAINT "Courier_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemComponent" ADD CONSTRAINT "OrderItemComponent_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemComponent" ADD CONSTRAINT "OrderItemComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementTarget" ADD CONSTRAINT "AnnouncementTarget_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementTarget" ADD CONSTRAINT "AnnouncementTarget_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardGrant" ADD CONSTRAINT "AwardGrant_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardGrant" ADD CONSTRAINT "AwardGrant_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

