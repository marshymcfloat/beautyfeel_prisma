/*
  Warnings:

  - You are about to drop the column `lastFollowUpReminderSentForDate` on the `Customer` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "RecommendedAppointmentStatus" AS ENUM ('RECOMMENDED', 'SCHEDULED', 'ATTENDED', 'CANCELLED', 'MISSED');

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "lastFollowUpReminderSentForDate";

-- CreateTable
CREATE TABLE "RecommendedAppointment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "recommendedDate" DATE NOT NULL,
    "originatingTransactionId" TEXT,
    "originatingAvailedServiceId" TEXT NOT NULL,
    "originatingServiceId" TEXT NOT NULL,
    "status" "RecommendedAppointmentStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "attendedTransactionId" TEXT,
    "reminder3DaySentAt" TIMESTAMP(3),
    "reminder2DaySentAt" TIMESTAMP(3),
    "reminder1DaySentAt" TIMESTAMP(3),
    "reminderTodaySentAt" TIMESTAMP(3),
    "reminder1DayAfterSentAt" TIMESTAMP(3),
    "reminder7DaySentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendedAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendedAppointment_originatingAvailedServiceId_key" ON "RecommendedAppointment"("originatingAvailedServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendedAppointment_attendedTransactionId_key" ON "RecommendedAppointment"("attendedTransactionId");

-- CreateIndex
CREATE INDEX "RecommendedAppointment_customerId_idx" ON "RecommendedAppointment"("customerId");

-- CreateIndex
CREATE INDEX "RecommendedAppointment_recommendedDate_idx" ON "RecommendedAppointment"("recommendedDate");

-- CreateIndex
CREATE INDEX "RecommendedAppointment_status_idx" ON "RecommendedAppointment"("status");

-- CreateIndex
CREATE INDEX "RecommendedAppointment_attendedTransactionId_idx" ON "RecommendedAppointment"("attendedTransactionId");

-- CreateIndex
CREATE INDEX "RecommendedAppointment_originatingServiceId_idx" ON "RecommendedAppointment"("originatingServiceId");

-- AddForeignKey
ALTER TABLE "RecommendedAppointment" ADD CONSTRAINT "RecommendedAppointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendedAppointment" ADD CONSTRAINT "RecommendedAppointment_originatingTransactionId_fkey" FOREIGN KEY ("originatingTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendedAppointment" ADD CONSTRAINT "RecommendedAppointment_originatingAvailedServiceId_fkey" FOREIGN KEY ("originatingAvailedServiceId") REFERENCES "AvailedService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendedAppointment" ADD CONSTRAINT "RecommendedAppointment_originatingServiceId_fkey" FOREIGN KEY ("originatingServiceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendedAppointment" ADD CONSTRAINT "RecommendedAppointment_attendedTransactionId_fkey" FOREIGN KEY ("attendedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
