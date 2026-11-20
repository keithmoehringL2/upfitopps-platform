CREATE TYPE "public"."interaction_channel" AS ENUM('call', 'email', 'text', 'visit');--> statement-breakpoint
CREATE TYPE "public"."interaction_outcome" AS ENUM('connected', 'left_message', 'no_answer', 'callback', 'meeting_set', 'not_interested', 'do_not_contact', 'bad_contact');--> statement-breakpoint
CREATE TABLE "interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distributor_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"rep_user_id" uuid NOT NULL,
	"channel" "interaction_channel" DEFAULT 'call' NOT NULL,
	"outcome" "interaction_outcome" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_distributor_id_distributor_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_rep_user_id_app_user_id_fk" FOREIGN KEY ("rep_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interaction_company_idx" ON "interaction" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "interaction_rep_idx" ON "interaction" USING btree ("rep_user_id");--> statement-breakpoint
CREATE INDEX "interaction_distributor_created_idx" ON "interaction" USING btree ("distributor_id","created_at");