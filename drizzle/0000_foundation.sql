CREATE TYPE "public"."account_status" AS ENUM('active', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."company_state" AS ENUM('cold', 'customer', 'opp');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('l2_admin', 'manager', 'rep', 'mfr_regional', 'mfr_leadership');--> statement-breakpoint
CREATE TYPE "public"."suppression_kind" AS ENUM('remove', 'dnc');--> statement-breakpoint
CREATE TYPE "public"."verify_purpose" AS ENUM('rep_device_verify', 'password_reset');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distributor_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distributor_id" uuid NOT NULL,
	"external_import_id" text,
	"name" text NOT NULL,
	"legal_name" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"website" text,
	"phone" text,
	"industry_primary" text,
	"industry_sub" text,
	"description" text,
	"total_vehicles" integer,
	"truck_count" integer,
	"van_count" integer,
	"fleet_mix" jsonb,
	"priority_score" numeric(2, 1),
	"priority_explanation" text,
	"source_program_id" uuid,
	"lifecycle_state" "company_state" DEFAULT 'cold' NOT NULL,
	"suppressed" "suppression_kind",
	"next_eligible_date" date,
	"touch_interval_days" integer,
	"last_touch_date" date,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distributor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"primary_color" text DEFAULT '#c8102e' NOT NULL,
	"logo_url" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "verify_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturer_program" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_distributor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"distributor_id" uuid NOT NULL,
	"regional_rep_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"distributor_id" uuid,
	"manufacturer_id" uuid,
	"password_hash" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"daily_target" integer,
	"daily_email_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_distributor_id_distributor_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_distributor_id_distributor_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_source_program_id_manufacturer_program_id_fk" FOREIGN KEY ("source_program_id") REFERENCES "public"."manufacturer_program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_owner_user_id_app_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturer_program" ADD CONSTRAINT "manufacturer_program_manufacturer_id_manufacturer_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_distributor" ADD CONSTRAINT "program_distributor_program_id_manufacturer_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."manufacturer_program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_distributor" ADD CONSTRAINT "program_distributor_distributor_id_distributor_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_distributor" ADD CONSTRAINT "program_distributor_regional_rep_user_id_app_user_id_fk" FOREIGN KEY ("regional_rep_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_distributor_id_distributor_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_manufacturer_id_manufacturer_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_distributor_idx" ON "audit_log" USING btree ("distributor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_distributor_external_uq" ON "company" USING btree ("distributor_id","external_import_id");--> statement-breakpoint
CREATE INDEX "company_distributor_idx" ON "company" USING btree ("distributor_id");--> statement-breakpoint
CREATE INDEX "company_owner_idx" ON "company" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "company_zip_idx" ON "company" USING btree ("distributor_id","zip");--> statement-breakpoint
CREATE UNIQUE INDEX "distributor_slug_uq" ON "distributor" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "verify_token_hash_uq" ON "email_verification_token" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "program_distributor_uq" ON "program_distributor" USING btree ("program_id","distributor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_hash_uq" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_distributor_email_uq" ON "app_user" USING btree ("distributor_id","email");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "app_user" USING btree ("email");