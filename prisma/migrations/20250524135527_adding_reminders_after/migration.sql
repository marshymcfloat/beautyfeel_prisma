-- AlterTable
ALTER TABLE "RecommendedAppointment" ADD COLUMN     "reminder14DayAfterSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder7DayAfterSentAt" TIMESTAMP(3);
