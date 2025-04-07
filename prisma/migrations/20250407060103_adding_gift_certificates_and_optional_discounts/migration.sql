/*
  Warnings:

  - A unique constraint covering the columns `[giftCertificateUsedId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "giftCertificateUsedId" TEXT;

-- CreateTable
CREATE TABLE "GiftCertificate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "purchaserCustomerId" TEXT,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "GiftCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GCService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GCService_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GCServiceSet" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GCServiceSet_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCertificate_code_key" ON "GiftCertificate"("code");

-- CreateIndex
CREATE INDEX "GiftCertificate_purchaserCustomerId_idx" ON "GiftCertificate"("purchaserCustomerId");

-- CreateIndex
CREATE INDEX "_GCService_B_index" ON "_GCService"("B");

-- CreateIndex
CREATE INDEX "_GCServiceSet_B_index" ON "_GCServiceSet"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_giftCertificateUsedId_key" ON "Transaction"("giftCertificateUsedId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_giftCertificateUsedId_fkey" FOREIGN KEY ("giftCertificateUsedId") REFERENCES "GiftCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCertificate" ADD CONSTRAINT "GiftCertificate_purchaserCustomerId_fkey" FOREIGN KEY ("purchaserCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GCService" ADD CONSTRAINT "_GCService_A_fkey" FOREIGN KEY ("A") REFERENCES "GiftCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GCService" ADD CONSTRAINT "_GCService_B_fkey" FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GCServiceSet" ADD CONSTRAINT "_GCServiceSet_A_fkey" FOREIGN KEY ("A") REFERENCES "GiftCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GCServiceSet" ADD CONSTRAINT "_GCServiceSet_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
