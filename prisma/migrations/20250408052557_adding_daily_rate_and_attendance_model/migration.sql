-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ATTENDANCE_CHECKER';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "dailyRate" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "accountId" TEXT NOT NULL,
    "isPresent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_date_accountId_key" ON "Attendance"("date", "accountId");

-- CreateIndex
CREATE INDEX "Account_branchId_idx" ON "Account"("branchId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
