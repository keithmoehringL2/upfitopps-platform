ALTER TABLE "company" ADD COLUMN "root_domain" text;--> statement-breakpoint
CREATE INDEX "company_distributor_domain_idx" ON "company" USING btree ("distributor_id","root_domain");