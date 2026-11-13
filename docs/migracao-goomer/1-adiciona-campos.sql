-- Importação do histórico do Goomer: só adiciona colunas/índices (nada é apagado).
BEGIN;
ALTER TABLE "Order"    ADD COLUMN IF NOT EXISTS "source"     TEXT;
ALTER TABLE "Order"    ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Order"    ADD COLUMN IF NOT EXISTS "historico"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "source"     TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_unitId_source_externalId_key"    ON "Order"("unitId","source","externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_unitId_source_externalId_key" ON "Customer"("unitId","source","externalId");
COMMIT;
