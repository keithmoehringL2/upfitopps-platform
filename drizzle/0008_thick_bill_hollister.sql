ALTER TYPE "public"."account_status" ADD VALUE 'onboarding';--> statement-breakpoint
ALTER TABLE "distributor" ADD COLUMN "secondary_color" text;--> statement-breakpoint
ALTER TABLE "program_distributor" ADD COLUMN "cohort" text;