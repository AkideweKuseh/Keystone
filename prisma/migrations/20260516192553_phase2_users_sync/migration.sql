-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "employee_no" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "card_number" TEXT,
    "pin_hash" TEXT,
    "face_image_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "door_index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "open_state" TEXT NOT NULL DEFAULT 'closed',

    CONSTRAINT "doors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_group_doors" (
    "access_group_id" UUID NOT NULL,
    "door_id" UUID NOT NULL,

    CONSTRAINT "access_group_doors_pkey" PRIMARY KEY ("access_group_id","door_id")
);

-- CreateTable
CREATE TABLE "user_access_groups" (
    "user_id" UUID NOT NULL,
    "access_group_id" UUID NOT NULL,

    CONSTRAINT "user_access_groups_pkey" PRIMARY KEY ("user_id","access_group_id")
);

-- CreateTable
CREATE TABLE "device_user_sync" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "desired_state" TEXT NOT NULL,
    "current_state" TEXT NOT NULL DEFAULT 'unknown',
    "sync_status" TEXT NOT NULL DEFAULT 'pending',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "device_user_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_tenant_id_status_idx" ON "users"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_employee_no_key" ON "users"("tenant_id", "employee_no");

-- CreateIndex
CREATE INDEX "user_credentials_user_id_idx" ON "user_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_credentials_user_id_type_card_number_key" ON "user_credentials"("user_id", "type", "card_number");

-- CreateIndex
CREATE UNIQUE INDEX "doors_device_id_door_index_key" ON "doors"("device_id", "door_index");

-- CreateIndex
CREATE INDEX "access_groups_tenant_id_idx" ON "access_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "device_user_sync_sync_status_idx" ON "device_user_sync"("sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "device_user_sync_device_id_user_id_key" ON "device_user_sync"("device_id", "user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doors" ADD CONSTRAINT "doors_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_groups" ADD CONSTRAINT "access_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_group_doors" ADD CONSTRAINT "access_group_doors_access_group_id_fkey" FOREIGN KEY ("access_group_id") REFERENCES "access_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_group_doors" ADD CONSTRAINT "access_group_doors_door_id_fkey" FOREIGN KEY ("door_id") REFERENCES "doors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_access_groups" ADD CONSTRAINT "user_access_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_access_groups" ADD CONSTRAINT "user_access_groups_access_group_id_fkey" FOREIGN KEY ("access_group_id") REFERENCES "access_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_user_sync" ADD CONSTRAINT "device_user_sync_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_user_sync" ADD CONSTRAINT "device_user_sync_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
