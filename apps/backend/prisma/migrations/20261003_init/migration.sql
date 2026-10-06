-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('viewer', 'operator', 'admin');

-- CreateEnum
CREATE TYPE "map_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "job_source" AS ENUM ('operator', 'kiosk_touch', 'kiosk_voice', 'auto');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'navigating', 'arrived', 'cancelled', 'failed', 'stopped');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'viewer',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "sid" TEXT NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "robots" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'SLAMTEC Hermes Pro Max',
    "base_url" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "robots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maps" (
    "id" BIGSERIAL NOT NULL,
    "robot_id" BIGINT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "map_status" NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "width_m" DECIMAL(6,2) NOT NULL,
    "height_m" DECIMAL(6,2) NOT NULL,
    "geometry" JSONB NOT NULL,
    "slam_map_ref" TEXT,
    "created_by" BIGINT,
    "published_by" BIGINT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pois" (
    "id" BIGSERIAL NOT NULL,
    "map_id" BIGINT NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "x" DECIMAL(8,3) NOT NULL,
    "y" DECIMAL(8,3) NOT NULL,
    "heading_deg" DECIMAL(5,1),
    "zone" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_dock" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pois_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keepout_zones" (
    "id" BIGSERIAL NOT NULL,
    "map_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,

    CONSTRAINT "keepout_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" BIGSERIAL NOT NULL,
    "ref" TEXT NOT NULL,
    "robot_id" BIGINT NOT NULL,
    "map_version" INTEGER NOT NULL,
    "dest_poi_code" TEXT NOT NULL,
    "dest_name" TEXT NOT NULL,
    "source" "job_source" NOT NULL,
    "requested_by" BIGINT,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "distance_m" DECIMAL(8,2),
    "departed_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_events" (
    "id" BIGSERIAL NOT NULL,
    "job_id" BIGINT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_samples" (
    "robot_id" BIGINT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "battery_pct" DECIMAL(5,2),
    "x" DECIMAL(8,3),
    "y" DECIMAL(8,3),
    "heading_deg" DECIMAL(5,1),
    "speed_mps" DECIMAL(5,2),
    "wifi_dbm" INTEGER,
    "cpu_pct" INTEGER,

    CONSTRAINT "telemetry_samples_pkey" PRIMARY KEY ("robot_id","at")
);

-- CreateTable
CREATE TABLE "control_lock" (
    "robot_id" BIGINT NOT NULL,
    "held_by" BIGINT,
    "mode" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "control_lock_pkey" PRIMARY KEY ("robot_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" BIGINT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB,
    "ip" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lang" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "intent" TEXT,
    "confidence" DECIMAL(4,3),
    "job_id" BIGINT,
    "latency_ms" INTEGER,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_rejections" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcript" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "ai_rejections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "robots_code_key" ON "robots"("code");

-- CreateIndex
CREATE INDEX "maps_robot_id_status_idx" ON "maps"("robot_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "maps_robot_id_version_key" ON "maps"("robot_id", "version");

-- Keep a single live map for each robot, including when a version is rolled back.
CREATE UNIQUE INDEX "one_published_map" ON "maps"("robot_id") WHERE "status" = 'published';

-- CreateIndex
CREATE UNIQUE INDEX "pois_map_id_code_key" ON "pois"("map_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_ref_key" ON "jobs"("ref");

-- CreateIndex
CREATE INDEX "jobs_robot_id_created_at_idx" ON "jobs"("robot_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "maps" ADD CONSTRAINT "maps_robot_id_fkey" FOREIGN KEY ("robot_id") REFERENCES "robots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pois" ADD CONSTRAINT "pois_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keepout_zones" ADD CONSTRAINT "keepout_zones_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_robot_id_fkey" FOREIGN KEY ("robot_id") REFERENCES "robots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_samples" ADD CONSTRAINT "telemetry_samples_robot_id_fkey" FOREIGN KEY ("robot_id") REFERENCES "robots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lock" ADD CONSTRAINT "control_lock_robot_id_fkey" FOREIGN KEY ("robot_id") REFERENCES "robots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
