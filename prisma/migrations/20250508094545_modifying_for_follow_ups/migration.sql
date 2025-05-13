-- CreateEnum
CREATE TYPE "FollowUpPolicy" AS ENUM ('NONE', 'ONCE', 'EVERY_TIME');

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "followUpPolicy" "FollowUpPolicy" NOT NULL DEFAULT 'NONE';
