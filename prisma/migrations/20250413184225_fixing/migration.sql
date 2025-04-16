/*
  Warnings:

  - You are about to drop the column `itemType` on the `AvailedService` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AvailedService" DROP CONSTRAINT "AvailedService_serviceSetId_fkey";

-- DropIndex
DROP INDEX "AvailedService_serviceSetId_idx";

-- AlterTable
ALTER TABLE "AvailedService" DROP COLUMN "itemType",
ADD COLUMN     "commissionValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "originatingSetId" TEXT,
ADD COLUMN     "originatingSetTitle" TEXT;

-- CreateIndex
CREATE INDEX "AvailedService_checkedById_idx" ON "AvailedService"("checkedById");

-- CreateIndex
CREATE INDEX "AvailedService_servedById_idx" ON "AvailedService"("servedById");

-- CreateIndex
CREATE INDEX "AvailedService_originatingSetId_idx" ON "AvailedService"("originatingSetId");
