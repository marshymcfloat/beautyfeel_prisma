-- AlterTable
ALTER TABLE "GiftCertificate" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "recipientCustomerId" TEXT;

-- CreateIndex
CREATE INDEX "GiftCertificate_recipientCustomerId_idx" ON "GiftCertificate"("recipientCustomerId");

-- AddForeignKey
ALTER TABLE "GiftCertificate" ADD CONSTRAINT "GiftCertificate_recipientCustomerId_fkey" FOREIGN KEY ("recipientCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCertificate" ADD CONSTRAINT "GiftCertificate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
