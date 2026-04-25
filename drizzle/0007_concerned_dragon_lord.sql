ALTER TYPE "public"."instance_status" ADD VALUE 'awaiting_provisioning' BEFORE 'provisioning';--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "wizard_state" jsonb;