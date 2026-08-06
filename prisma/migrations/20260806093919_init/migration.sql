-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('AVAILABLE', 'LOW_STOCK', 'CRITICAL', 'OUT_OF_STOCK');

-- CreateTable
CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "dealerName" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "municipality" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "StockStatus" NOT NULL DEFAULT 'OUT_OF_STOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHistory" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_sourceKey_key" ON "Dealer"("sourceKey");

-- CreateIndex
CREATE INDEX "Dealer_status_idx" ON "Dealer"("status");

-- CreateIndex
CREATE INDEX "Dealer_district_idx" ON "Dealer"("district");

-- CreateIndex
CREATE INDEX "Dealer_dealerName_idx" ON "Dealer"("dealerName");

-- CreateIndex
CREATE INDEX "StockHistory_dealerId_updatedAt_idx" ON "StockHistory"("dealerId", "updatedAt");

-- CreateIndex
CREATE INDEX "StockHistory_updatedAt_idx" ON "StockHistory"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
