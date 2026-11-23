CREATE TYPE "public"."import_status" AS ENUM('committed', 'rolled_back');--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distributor_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"filename" text NOT NULL,
	"column_map" jsonb NOT NULL,
	"counts" jsonb NOT NULL,
	"overrides" jsonb,
	"status" "import_status" DEFAULT 'committed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"was_insert" boolean NOT NULL,
	"before" jsonb
);
--> statement-breakpoint
ALTER TABLE "manufacturer_program" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_distributor_id_distributor_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_uploaded_by_user_id_app_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_change" ADD CONSTRAINT "import_change_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_change" ADD CONSTRAINT "import_change_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batch_distributor_idx" ON "import_batch" USING btree ("distributor_id");--> statement-breakpoint
CREATE INDEX "import_change_batch_idx" ON "import_change" USING btree ("import_batch_id");