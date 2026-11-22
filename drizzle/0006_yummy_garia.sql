ALTER TABLE "company" ADD COLUMN "retry_date" date;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "no_contact_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "queued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Backfill: existing rows inherit their creation order so the stable queue
-- reflects when each prospect actually entered, not the migration time.
UPDATE "company" SET "queued_at" = "created_at";