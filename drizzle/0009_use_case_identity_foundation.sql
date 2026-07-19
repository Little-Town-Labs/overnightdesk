CREATE TYPE "public"."use_case_status" AS ENUM('planned', 'active', 'suspended', 'retired');--> statement-breakpoint
CREATE TYPE "public"."runtime_identity_status" AS ENUM('planned', 'active', 'suspended', 'retired');--> statement-breakpoint
CREATE TYPE "public"."persona_assignment_status" AS ENUM('active', 'disabled', 'retired');--> statement-breakpoint
CREATE TYPE "public"."use_case_membership_role" AS ENUM('owner', 'operator', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."use_case_membership_status" AS ENUM('invited', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."resource_binding_kind" AS ENUM('platform_instance', 'orchestrator_tenant', 'container', 'volume', 'hostname', 'phase_path', 'oidc_client', 'intake_route');--> statement-breakpoint
CREATE TYPE "public"."resource_binding_state" AS ENUM('active', 'compatibility', 'rollback', 'retired');--> statement-breakpoint

CREATE TABLE "use_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "use_case_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "use_case_slug_unique" UNIQUE("slug")
);--> statement-breakpoint

CREATE TABLE "use_case_number_allocation" (
	"number" bigint PRIMARY KEY NOT NULL,
	"use_case_id" uuid NOT NULL,
	"allocated_by" text NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "use_case_number_nonnegative" CHECK ("use_case_number_allocation"."number" >= 0),
	CONSTRAINT "use_case_number_safe_integer" CHECK ("use_case_number_allocation"."number" <= 9007199254740991)
);--> statement-breakpoint

CREATE TABLE "runtime_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"use_case_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"memory_boundary_kind" text NOT NULL,
	"status" "runtime_identity_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "runtime_identity_slug_unique" UNIQUE("slug")
);--> statement-breakpoint

CREATE TABLE "persona_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runtime_identity_id" uuid NOT NULL,
	"persona_key" text NOT NULL,
	"display_name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"authority_profile" text NOT NULL,
	"status" "persona_assignment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "use_case_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"use_case_id" uuid NOT NULL,
	"runtime_identity_id" uuid,
	"user_id" text NOT NULL,
	"role" "use_case_membership_role" NOT NULL,
	"status" "use_case_membership_status" DEFAULT 'invited' NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "resource_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"use_case_id" uuid NOT NULL,
	"runtime_identity_id" uuid,
	"provider" text NOT NULL,
	"kind" "resource_binding_kind" NOT NULL,
	"value" text NOT NULL,
	"state" "resource_binding_state" DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_binding_valid_interval" CHECK ("resource_binding"."valid_until" IS NULL OR "resource_binding"."valid_until" > "resource_binding"."valid_from")
);--> statement-breakpoint

CREATE TABLE "secret_boundary_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"use_case_id" uuid NOT NULL,
	"runtime_identity_id" uuid,
	"phase_app" text NOT NULL,
	"environment" text NOT NULL,
	"path_identifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "instance" ADD COLUMN "use_case_id" uuid;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "runtime_identity_id" uuid;--> statement-breakpoint

ALTER TABLE "use_case_number_allocation" ADD CONSTRAINT "use_case_number_allocation_use_case_id_fk" FOREIGN KEY ("use_case_id") REFERENCES "public"."use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_identity" ADD CONSTRAINT "runtime_identity_use_case_id_fk" FOREIGN KEY ("use_case_id") REFERENCES "public"."use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_assignment" ADD CONSTRAINT "persona_assignment_runtime_identity_id_fk" FOREIGN KEY ("runtime_identity_id") REFERENCES "public"."runtime_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "use_case_membership" ADD CONSTRAINT "use_case_membership_use_case_id_fk" FOREIGN KEY ("use_case_id") REFERENCES "public"."use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "use_case_membership" ADD CONSTRAINT "use_case_membership_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_binding" ADD CONSTRAINT "resource_binding_use_case_id_fk" FOREIGN KEY ("use_case_id") REFERENCES "public"."use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_boundary_binding" ADD CONSTRAINT "secret_boundary_binding_use_case_id_fk" FOREIGN KEY ("use_case_id") REFERENCES "public"."use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_use_case_id_fk" FOREIGN KEY ("use_case_id") REFERENCES "public"."use_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "use_case_number_allocation_use_case_unique" ON "use_case_number_allocation" USING btree ("use_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_identity_id_use_case_unique" ON "runtime_identity" USING btree ("id", "use_case_id");--> statement-breakpoint
CREATE INDEX "runtime_identity_use_case_idx" ON "runtime_identity" USING btree ("use_case_id");--> statement-breakpoint

ALTER TABLE "use_case_membership" ADD CONSTRAINT "use_case_membership_runtime_scope_fk" FOREIGN KEY ("runtime_identity_id", "use_case_id") REFERENCES "public"."runtime_identity"("id", "use_case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_binding" ADD CONSTRAINT "resource_binding_runtime_scope_fk" FOREIGN KEY ("runtime_identity_id", "use_case_id") REFERENCES "public"."runtime_identity"("id", "use_case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_boundary_binding" ADD CONSTRAINT "secret_boundary_binding_runtime_scope_fk" FOREIGN KEY ("runtime_identity_id", "use_case_id") REFERENCES "public"."runtime_identity"("id", "use_case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_runtime_scope_fk" FOREIGN KEY ("runtime_identity_id", "use_case_id") REFERENCES "public"."runtime_identity"("id", "use_case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_runtime_requires_use_case" CHECK ("instance"."runtime_identity_id" IS NULL OR "instance"."use_case_id" IS NOT NULL);--> statement-breakpoint

CREATE UNIQUE INDEX "persona_assignment_live_key_unique" ON "persona_assignment" USING btree ("runtime_identity_id", "persona_key") WHERE "persona_assignment"."status" <> 'retired';--> statement-breakpoint
CREATE UNIQUE INDEX "persona_assignment_one_active_default" ON "persona_assignment" USING btree ("runtime_identity_id") WHERE "persona_assignment"."is_default" = true AND "persona_assignment"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "use_case_membership_scope_unique" ON "use_case_membership" USING btree ("use_case_id", "user_id") WHERE "use_case_membership"."runtime_identity_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_membership_scope_unique" ON "use_case_membership" USING btree ("use_case_id", "runtime_identity_id", "user_id") WHERE "use_case_membership"."runtime_identity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "use_case_membership_user_idx" ON "use_case_membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_binding_live_identifier_unique" ON "resource_binding" USING btree ("provider", "kind", "value") WHERE "resource_binding"."state" <> 'retired';--> statement-breakpoint
CREATE INDEX "resource_binding_use_case_idx" ON "resource_binding" USING btree ("use_case_id");--> statement-breakpoint
CREATE INDEX "resource_binding_runtime_idx" ON "resource_binding" USING btree ("runtime_identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_boundary_binding_use_case_scope_unique" ON "secret_boundary_binding" USING btree ("use_case_id", "phase_app", "environment", "path_identifier") WHERE "secret_boundary_binding"."runtime_identity_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "secret_boundary_binding_runtime_scope_unique" ON "secret_boundary_binding" USING btree ("use_case_id", "runtime_identity_id", "phase_app", "environment", "path_identifier") WHERE "secret_boundary_binding"."runtime_identity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "instance_use_case_idx" ON "instance" USING btree ("use_case_id");--> statement-breakpoint
CREATE INDEX "instance_runtime_identity_idx" ON "instance" USING btree ("runtime_identity_id");--> statement-breakpoint

CREATE FUNCTION prevent_use_case_number_allocation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'use-case number allocations are immutable and cannot be reused';
END;
$$;--> statement-breakpoint

CREATE TRIGGER use_case_number_allocation_immutable
BEFORE UPDATE OR DELETE ON use_case_number_allocation
FOR EACH ROW
EXECUTE FUNCTION prevent_use_case_number_allocation_mutation();
