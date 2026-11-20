ALTER TABLE "company" ADD COLUMN "decision_maker" jsonb;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "decision_maker_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "quote_count" integer DEFAULT 0 NOT NULL;