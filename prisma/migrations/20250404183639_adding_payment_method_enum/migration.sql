/*
  Warnings:

  - The `paymentMethod` column on the `Transaction` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ewallet', 'cash', 'bank');

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "paymentMethod",
ADD COLUMN     "paymentMethod" "PaymentMethod";
