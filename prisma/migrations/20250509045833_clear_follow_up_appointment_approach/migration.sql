-- AlterTable
ALTER TABLE "RecommendedAppointment" ADD COLUMN     "suppressNextFollowUpGeneration" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "RecommendedAppointment_suppressNextFollowUpGeneration_idx" ON "RecommendedAppointment"("suppressNextFollowUpGeneration");
