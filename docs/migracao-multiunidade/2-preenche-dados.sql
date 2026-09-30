-- Cria a unidade MATRIZ e associa TODOS os dados existentes a ela. Idempotente (só toca linhas com unitId nulo).
INSERT INTO "Unit" (id, "brandId", type, name, slug, city, state, active, "createdAt", "updatedAt")
SELECT 'unit_matriz', b.id, 'HQ', b.name, 'matriz', 'São José do Rio Preto', 'SP', true, now(), now()
FROM "Brand" b ORDER BY b."createdAt" ASC LIMIT 1
ON CONFLICT (slug) DO NOTHING;

UPDATE "User"            SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "Customer"        SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "DeliveryZone"    SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "Category"        SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "Product"         SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "ThematicMenu"    SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "BannerSlide"     SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "Order"           SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "Coupon"          SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;
UPDATE "WhatsAppSession" SET "unitId" = (SELECT id FROM "Unit" WHERE slug = 'matriz') WHERE "unitId" IS NULL;

-- Trava de segurança: se sobrar qualquer linha sem unidade, a transação inteira é desfeita (o passo 3 nem chegaria a rodar)
DO $$
DECLARE n int;
BEGIN
  SELECT (SELECT count(*) FROM "User" WHERE "unitId" IS NULL) + (SELECT count(*) FROM "Customer" WHERE "unitId" IS NULL)
       + (SELECT count(*) FROM "DeliveryZone" WHERE "unitId" IS NULL) + (SELECT count(*) FROM "Category" WHERE "unitId" IS NULL)
       + (SELECT count(*) FROM "Product" WHERE "unitId" IS NULL) + (SELECT count(*) FROM "ThematicMenu" WHERE "unitId" IS NULL)
       + (SELECT count(*) FROM "BannerSlide" WHERE "unitId" IS NULL) + (SELECT count(*) FROM "Order" WHERE "unitId" IS NULL)
       + (SELECT count(*) FROM "Coupon" WHERE "unitId" IS NULL) + (SELECT count(*) FROM "WhatsAppSession" WHERE "unitId" IS NULL) INTO n;
  IF n > 0 THEN RAISE EXCEPTION 'Migração abortada: % linha(s) sem unidade após o preenchimento', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Unit" WHERE slug = 'matriz') THEN RAISE EXCEPTION 'Migração abortada: unidade matriz não foi criada (não há Brand?)'; END IF;
END $$;
