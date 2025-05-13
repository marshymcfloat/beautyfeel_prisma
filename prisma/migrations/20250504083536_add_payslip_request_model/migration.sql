-- CreateEnum
CREATE TYPE "PayslipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "PayslipRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "requestTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStartDate" DATE NOT NULL,
    "periodEndDate" DATE NOT NULL,
    "status" "PayslipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "processedById" TEXT,
    "processedTimestamp" TIMESTAMP(3),
    "relatedPayslipId" TEXT,

    CONSTRAINT "PayslipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayslipRequest_relatedPayslipId_key" ON "PayslipRequest"("relatedPayslipId");

-- CreateIndex
CREATE INDEX "PayslipRequest_accountId_status_idx" ON "PayslipRequest"("accountId", "status");

-- CreateIndex
CREATE INDEX "PayslipRequest_status_idx" ON "PayslipRequest"("status");

-- AddForeignKey
ALTER TABLE "PayslipRequest" ADD CONSTRAINT "PayslipRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipRequest" ADD CONSTRAINT "PayslipRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipRequest" ADD CONSTRAINT "PayslipRequest_relatedPayslipId_fkey" FOREIGN KEY ("relatedPayslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
