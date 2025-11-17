/*
  Warnings:

  - You are about to drop the column `checkedById` on the `AvailedService` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `AvailedService` table. All the data in the column will be lost.
  - You are about to drop the column `servedById` on the `AvailedService` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `AvailedService` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AvailedService" DROP CONSTRAINT "AvailedService_checkedById_fkey";

-- DropForeignKey
ALTER TABLE "AvailedService" DROP CONSTRAINT "AvailedService_servedById_fkey";

-- DropIndex
DROP INDEX "AvailedService_checkedById_idx";

-- DropIndex
DROP INDEX "AvailedService_servedById_idx";

-- AlterTable
ALTER TABLE "AvailedService" DROP COLUMN "checkedById",
DROP COLUMN "completedAt",
DROP COLUMN "servedById",
DROP COLUMN "status";

-- CreateTable
CREATE TABLE "AvailedServiceUnit" (
    "id" TEXT NOT NULL,
    "availedServiceId" TEXT NOT NULL,
    "unitIndex" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "servedById" TEXT,
    "servedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailedServiceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailedServiceUnit_checkedById_idx" ON "AvailedServiceUnit"("checkedById");

-- CreateIndex
CREATE INDEX "AvailedServiceUnit_servedById_idx" ON "AvailedServiceUnit"("servedById");

-- CreateIndex
CREATE INDEX "AvailedServiceUnit_status_idx" ON "AvailedServiceUnit"("status");

-- CreateIndex
CREATE INDEX "AvailedServiceUnit_availedServiceId_idx" ON "AvailedServiceUnit"("availedServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailedServiceUnit_availedServiceId_unitIndex_key" ON "AvailedServiceUnit"("availedServiceId", "unitIndex");

-- CreateIndex
CREATE INDEX "GiftCertificate_customerId_idx" ON "GiftCertificate"("customerId");

-- AddForeignKey
ALTER TABLE "AvailedServiceUnit" ADD CONSTRAINT "AvailedServiceUnit_availedServiceId_fkey" FOREIGN KEY ("availedServiceId") REFERENCES "AvailedService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailedServiceUnit" ADD CONSTRAINT "AvailedServiceUnit_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailedServiceUnit" ADD CONSTRAINT "AvailedServiceUnit_servedById_fkey" FOREIGN KEY ("servedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
