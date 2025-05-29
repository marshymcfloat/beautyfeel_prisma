-- AlterTable
ALTER TABLE "AvailedService" ADD COLUMN     "postTreatmentEmailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "postTreatmentEmailSubject" TEXT,
ADD COLUMN     "postTreatmentInstructions" TEXT,
ADD COLUMN     "sendPostTreatmentEmail" BOOLEAN NOT NULL DEFAULT false;
