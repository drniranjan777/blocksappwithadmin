-- CreateEnum
CREATE TYPE "ad_paused_by" AS ENUM ('OWNER', 'STAFF', 'SYSTEM');

-- AlterEnum
ALTER TYPE "ad_status" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "ad_campaigns" ADD COLUMN     "billing_reference" VARCHAR(80),
ADD COLUMN     "funded_at" TIMESTAMPTZ(3),
ADD COLUMN     "paused_by" "ad_paused_by",
ADD COLUMN     "submitted_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "business_pages" ADD COLUMN     "status_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "status_reason" VARCHAR(300);
