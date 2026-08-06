-- AlterTable
ALTER TABLE "Dealer" ADD COLUMN     "erpVendorId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_erpVendorId_key" ON "Dealer"("erpVendorId");
