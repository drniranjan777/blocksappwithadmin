-- CreateEnum
CREATE TYPE "incident_event_kind" AS ENUM ('OPENED', 'NOTE', 'ASSIGNED', 'ESCALATED', 'RESOLVED', 'REOPENED');

-- AlterTable
ALTER TABLE "safety_incidents" ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "report_id" UUID;

-- CreateTable
CREATE TABLE "safety_incident_events" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "admin_id" UUID,
    "kind" "incident_event_kind" NOT NULL,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "safety_incident_events_incident_id_created_at_idx" ON "safety_incident_events"("incident_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "appeals_moderation_action_id_key" ON "appeals"("moderation_action_id");

-- CreateIndex
CREATE INDEX "safety_incidents_report_id_idx" ON "safety_incidents"("report_id");

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incident_events" ADD CONSTRAINT "safety_incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "safety_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incident_events" ADD CONSTRAINT "safety_incident_events_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
