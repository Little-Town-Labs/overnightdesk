CREATE TYPE "public"."content_worthiness" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."newsletter_category" AS ENUM('ai-llm', 'developer-tools', 'product-saas', 'fundraising-market', 'security', 'general-tech');--> statement-breakpoint
CREATE TABLE "oc_newsletter_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"ingested_id" text NOT NULL,
	"source" text NOT NULL,
	"sender" text,
	"subject" text,
	"summary" text NOT NULL,
	"category" "newsletter_category" NOT NULL,
	"content_worthiness" "content_worthiness" NOT NULL,
	"blog_angle" text,
	"linkedin_angle" text,
	"model_used" text NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oc_newsletter_insights_ingested_id_unique" UNIQUE("ingested_id")
);
--> statement-breakpoint
CREATE INDEX "idx_oc_newsletter_insights_category" ON "oc_newsletter_insights" USING btree ("category","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_oc_newsletter_insights_high_value" ON "oc_newsletter_insights" USING btree ("content_worthiness","created_at" DESC NULLS LAST) WHERE "oc_newsletter_insights"."content_worthiness" = 'high';--> statement-breakpoint
CREATE INDEX "idx_oc_newsletter_insights_run" ON "oc_newsletter_insights" USING btree ("run_id");