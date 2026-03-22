CREATE TYPE "public"."email_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_type" AS ENUM('verification', 'password_reset', 'welcome', 'payment_failure', 'provisioning');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"recipient_email" text NOT NULL,
	"email_type" "email_type" NOT NULL,
	"resend_id" text,
	"status" "email_status" DEFAULT 'sent' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;