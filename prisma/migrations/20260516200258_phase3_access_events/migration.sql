-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "event_mode" TEXT NOT NULL DEFAULT 'push',
ADD COLUMN     "push_token" TEXT,
ADD COLUMN     "push_token_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "access_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "device_id" UUID,
    "door_id" UUID,
    "user_id" UUID,
    "employee_no" TEXT,
    "event_type" TEXT NOT NULL DEFAULT 'unprocessed',
    "event_subtype" TEXT,
    "event_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedup_key" TEXT,

    CONSTRAINT "access_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_events_dedup_key_key" ON "access_events"("dedup_key");

-- CreateIndex
CREATE INDEX "access_events_tenant_id_event_time_idx" ON "access_events"("tenant_id", "event_time" DESC);

-- CreateIndex
CREATE INDEX "access_events_device_id_event_time_idx" ON "access_events"("device_id", "event_time" DESC);

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
