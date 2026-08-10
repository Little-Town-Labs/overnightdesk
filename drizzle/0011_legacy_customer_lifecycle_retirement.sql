-- Apply only after the Feature 040 zero-state plan reports ready and the
-- separately approved backup/rollback gates are satisfied.
--
-- Reversal is intentionally approval-gated rather than automatic. Persist the
-- successful apply artifact, set LEGACY_CLEANUP_PLAN_PATH to that artifact,
-- and run:
--   npx tsx scripts/legacy-customer-lifecycle-cleanup.ts rollback
-- The rollback command recreates only objects recorded in the before-state.

DO $$
BEGIN
  IF to_regclass('public.subscription') IS NOT NULL THEN
    LOCK TABLE public."subscription" IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM public."subscription" LIMIT 1) THEN
      RAISE EXCEPTION 'local subscription rows are not zero';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'instance'
      AND column_name = 'wizard_state'
  ) THEN
    LOCK TABLE public."instance" IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (
      SELECT 1
      FROM public."instance"
      WHERE "wizard_state" IS NOT NULL
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'meaningful wizard state is not zero';
    END IF;
  END IF;

  IF to_regclass('public.subscription') IS NOT NULL THEN
    DROP TABLE public."subscription";
  END IF;

  IF to_regtype('public.subscription_plan') IS NOT NULL THEN
    DROP TYPE public.subscription_plan;
  END IF;

  IF to_regtype('public.subscription_status') IS NOT NULL THEN
    DROP TYPE public.subscription_status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'instance'
      AND column_name = 'wizard_state'
  ) THEN
    ALTER TABLE public."instance" DROP COLUMN "wizard_state";
  END IF;
END
$$;
