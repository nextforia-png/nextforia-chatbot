CREATE TABLE "StorePairing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pairedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "pairedBySessionId" TEXT
);

CREATE UNIQUE INDEX "StorePairing_shop_key" ON "StorePairing"("shop");
