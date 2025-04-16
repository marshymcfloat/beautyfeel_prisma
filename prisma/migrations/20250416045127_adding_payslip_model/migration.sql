-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('PENDING', 'RELEASED');

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodStartDate" DATE NOT NULL,
    "periodEndDate" DATE NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "totalCommissions" INTEGER NOT NULL,
    "totalDeductions" INTEGER NOT NULL DEFAULT 0,
    "totalBonuses" INTEGER NOT NULL DEFAULT 0,
    "netPay" INTEGER NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'PENDING',
    "releasedDate" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payslip_accountId_idx" ON "Payslip"("accountId");

-- CreateIndex
CREATE INDEX "Payslip_periodStartDate_periodEndDate_idx" ON "Payslip"("periodStartDate", "periodEndDate");

-- CreateIndex
CREATE INDEX "Payslip_status_idx" ON "Payslip"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_accountId_periodStartDate_periodEndDate_key" ON "Payslip"("accountId", "periodStartDate", "periodEndDate");

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
