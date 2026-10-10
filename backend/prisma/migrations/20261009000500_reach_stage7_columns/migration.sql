-- AlterTable
ALTER TABLE "reach_config_versions" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "reward_cycles" ADD COLUMN     "summary" JSONB;
