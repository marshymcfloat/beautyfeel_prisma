/*
  Warnings:

  - You are about to drop the column `checkedBy` on the `AvailedService` table. All the data in the column will be lost.
  - You are about to drop the column `servedBy` on the `AvailedService` table. All the data in the column will be lost.
  - Made the column `name` on table `Account` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "Status" ADD VALUE 'CANCELLED';

-- DropIndex
DROP INDEX "Account_name_key";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "salary" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "name" SET NOT NULL;

-- AlterTable
ALTER TABLE "AvailedService" DROP COLUMN "checkedBy",
DROP COLUMN "servedBy",
ADD COLUMN     "checkedById" TEXT,
ADD COLUMN     "servedById" TEXT,
ALTER COLUMN "quantity" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "branchId" TEXT,
ALTER COLUMN "discount" SET DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailedService" ADD CONSTRAINT "AvailedService_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailedService" ADD CONSTRAINT "AvailedService_servedById_fkey" FOREIGN KEY ("servedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
