-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "bookingReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Transaction_status_bookedFor_bookingReminderSentAt_idx" ON "Transaction"("status", "bookedFor", "bookingReminderSentAt");
