CREATE TYPE "public"."follow_up_source" AS ENUM('rep', 'system');--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "follow_up_source" "follow_up_source";--> statement-breakpoint
-- Unified follow-up model: fold any in-flight No-Contact Retry into the
-- follow-up date as a system-assigned follow-up, and tag existing rep-set
-- follow-ups so the UI can label their source.
UPDATE "company" SET "follow_up_date" = "retry_date", "follow_up_source" = 'system' WHERE "retry_date" IS NOT NULL AND "follow_up_date" IS NULL;--> statement-breakpoint
UPDATE "company" SET "follow_up_source" = 'rep' WHERE "follow_up_date" IS NOT NULL AND "follow_up_source" IS NULL;