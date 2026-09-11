CREATE TYPE "game_data"."trophy_award_rule_kind" AS ENUM('direct_source', 'manual', 'max_count', 'max_spp_sum', 'career_threshold');--> statement-breakpoint
CREATE TYPE "game_data"."trophy_award_rule_measure" AS ENUM('event_count', 'spp_sum');--> statement-breakpoint
CREATE TYPE "game_data"."trophy_award_rule_role" AS ENUM('acting', 'consequence');--> statement-breakpoint
CREATE TABLE "game_data"."trophy_award_rule_excluded_match_event_types" (
	"id" serial PRIMARY KEY,
	"trophy_id" integer NOT NULL,
	"action_type" "game_data"."action_type",
	"consequence_type" "game_data"."consequence_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "trophy_award_rule_excluded_match_event_types_trophy_type_unique" UNIQUE NULLS NOT DISTINCT("trophy_id","action_type","consequence_type"),
	CONSTRAINT "trophy_award_rule_excluded_match_event_types_one_type" CHECK (("action_type" IS NOT NULL) != ("consequence_type" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "game_data"."trophy_award_rule_excluded_match_event_types_history" (LIKE "game_data"."trophy_award_rule_excluded_match_event_types");
--> statement-breakpoint
CREATE TABLE "game_data"."trophy_award_rule_match_event_types" (
	"id" serial PRIMARY KEY,
	"trophy_id" integer NOT NULL,
	"action_type" "game_data"."action_type",
	"consequence_type" "game_data"."consequence_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "trophy_award_rule_match_event_types_trophy_type_unique" UNIQUE NULLS NOT DISTINCT("trophy_id","action_type","consequence_type"),
	CONSTRAINT "trophy_award_rule_match_event_types_one_type" CHECK (("action_type" IS NOT NULL) != ("consequence_type" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "game_data"."trophy_award_rule_match_event_types_history" (LIKE "game_data"."trophy_award_rule_match_event_types");
--> statement-breakpoint
-- Every ADD COLUMN for both trophies_history and trophies happens first, in
-- full, before any DML (UPDATE) touches either table below. This is required,
-- not stylistic: the versioning() trigger on "trophies" was already invoked
-- once by an earlier migration/session in the same transaction (or, on an
-- empty database, will be invoked for the first time by the UPDATE below);
-- Postgres's plpgsql trigger machinery caches per-relation row-type
-- information across invocations of the SAME trigger function within one
-- transaction, and does not reliably invalidate that cache when the table's
-- column set changes via ALTER TABLE ADD COLUMN in between. Splitting the
-- ADD COLUMNs so that a later one lands between two UPDATEs that both fire
-- this trigger was verified (via a real Postgres 18 container seeded with
-- non-empty "trophies" rows) to silently drop newly-added column values from
-- the second UPDATE — no error, just data that never lands. Doing every ADD
-- COLUMN up front, before the first UPDATE fires the trigger at all, avoids
-- the staleness entirely.
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_kind" "game_data"."trophy_award_rule_kind";--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_procedure" varchar(1024);--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_role" "game_data"."trophy_award_rule_role";--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_tie_cutoff" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_threshold" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_measure" "game_data"."trophy_award_rule_measure";--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_kind" "game_data"."trophy_award_rule_kind";--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_procedure" varchar(1024);--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_role" "game_data"."trophy_award_rule_role";--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_tie_cutoff" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_threshold" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_measure" "game_data"."trophy_award_rule_measure";--> statement-breakpoint
UPDATE "game_data"."trophies_history" SET "award_rule_kind" = 'direct_source' WHERE "award_rule_kind" IS NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ALTER COLUMN "award_rule_kind" SET NOT NULL;--> statement-breakpoint
UPDATE "game_data"."trophies" SET "award_rule_kind" = 'direct_source' WHERE "award_rule_kind" IS NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ALTER COLUMN "award_rule_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_excluded_match_event_types" ADD CONSTRAINT "trophy_award_rule_excluded_match_event_types_ocNF06vT5NvX_fkey" FOREIGN KEY ("trophy_id") REFERENCES "game_data"."trophies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_match_event_types" ADD CONSTRAINT "trophy_award_rule_match_event_types_trophy_id_trophies_id_fkey" FOREIGN KEY ("trophy_id") REFERENCES "game_data"."trophies"("id") ON DELETE CASCADE;--> statement-breakpoint
-- A single combined UPDATE (rather than the two separate "copy description,
-- then fall back to a fixed sentence" statements it might otherwise take) so
-- the versioning() trigger only fires once more for this backfill, per the
-- same plan-cache-staleness reasoning as the ADD COLUMN reordering above.
-- Reused by tools/import-manual on its next run, which overwrites this
-- placeholder with real curated procedures for every environment — databases
-- here are dropped and re-imported rather than migrated in place.
UPDATE "game_data"."trophies" SET "award_procedure" = COALESCE("description", 'Recorded by the source importer.') WHERE "award_procedure" IS NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD CONSTRAINT "trophies_award_rule" CHECK ((
        "award_rule_kind" IN ('direct_source', 'manual')
        AND "award_procedure" IS NOT NULL
        AND "award_rule_role" IS NULL
        AND "award_rule_tie_cutoff" IS NULL
        AND "award_rule_threshold" IS NULL
        AND "award_rule_measure" IS NULL
      ) OR (
        "award_rule_kind" IN ('max_count', 'max_spp_sum')
        AND "award_procedure" IS NULL
        AND "award_rule_role" IS NOT NULL
        AND "award_rule_tie_cutoff" IS NOT NULL
        AND "award_rule_threshold" IS NULL
        AND "award_rule_measure" IS NULL
      ) OR (
        "award_rule_kind" = 'career_threshold'
        AND "award_procedure" IS NULL
        AND "award_rule_role" IS NOT NULL
        AND "award_rule_tie_cutoff" IS NULL
        AND "award_rule_threshold" IS NOT NULL
        AND "award_rule_measure" IS NOT NULL
      ));
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_excluded_match_event_types_history" ADD CONSTRAINT "trophy_award_rule_excluded_match_event_types_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_excluded_match_event_types_history" ADD CONSTRAINT "trophy_award_rule_excluded_match_event_types_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."trophy_award_rule_excluded_match_event_types"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_award_rule_excluded_match_event_types_versioning ON "game_data"."trophy_award_rule_excluded_match_event_types";
--> statement-breakpoint
CREATE TRIGGER trophy_award_rule_excluded_match_event_types_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."trophy_award_rule_excluded_match_event_types"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.trophy_award_rule_excluded_match_event_types_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_award_rule_excluded_match_event_types_set_updated_at ON "game_data"."trophy_award_rule_excluded_match_event_types";
--> statement-breakpoint
CREATE TRIGGER trophy_award_rule_excluded_match_event_types_set_updated_at
  BEFORE UPDATE ON "game_data"."trophy_award_rule_excluded_match_event_types"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_match_event_types_history" ADD CONSTRAINT "trophy_award_rule_match_event_types_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_match_event_types_history" ADD CONSTRAINT "trophy_award_rule_match_event_types_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."trophy_award_rule_match_event_types"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_award_rule_match_event_types_versioning ON "game_data"."trophy_award_rule_match_event_types";
--> statement-breakpoint
CREATE TRIGGER trophy_award_rule_match_event_types_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."trophy_award_rule_match_event_types"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.trophy_award_rule_match_event_types_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_award_rule_match_event_types_set_updated_at ON "game_data"."trophy_award_rule_match_event_types";
--> statement-breakpoint
CREATE TRIGGER trophy_award_rule_match_event_types_set_updated_at
  BEFORE UPDATE ON "game_data"."trophy_award_rule_match_event_types"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
