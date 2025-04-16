/*
  Warnings:

  - You are about to drop the column `giftCertificateUsedId` on the `Transaction` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AvailedItemType" AS ENUM ('SERVICE', 'SET');

-- DropForeignKey
ALTER TABLE "AvailedService" DROP CONSTRAINT "AvailedService_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_giftCertificateUsedId_fkey";

-- DropIndex
DROP INDEX "Transaction_giftCertificateUsedId_key";

-- AlterTable
ALTER TABLE "AvailedService" ADD COLUMN     "itemType" "AvailedItemType",
ADD COLUMN     "serviceSetId" TEXT,
ALTER COLUMN "serviceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "giftCertificateUsedId";

-- CreateIndex
CREATE INDEX "AvailedService_serviceId_idx" ON "AvailedService"("serviceId");

-- CreateIndex
CREATE INDEX "AvailedService_serviceSetId_idx" ON "AvailedService"("serviceSetId");

-- CreateIndex
CREATE INDEX "AvailedService_transactionId_idx" ON "AvailedService"("transactionId");

-- CreateIndex
CREATE INDEX "Service_branchId_idx" ON "Service"("branchId");

-- CreateIndex
CREATE INDEX "Transaction_customerId_idx" ON "Transaction"("customerId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- AddForeignKey
ALTER TABLE "AvailedService" ADD CONSTRAINT "AvailedService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailedService" ADD CONSTRAINT "AvailedService_serviceSetId_fkey" FOREIGN KEY ("serviceSetId") REFERENCES "ServiceSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
