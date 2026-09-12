CREATE TYPE "game_data"."trophy_award_rule_kind" AS ENUM('direct_source', 'manual', 'max_count', 'max_spp_sum', 'career_threshold');--> statement-breakpoint
CREATE TYPE "game_data"."trophy_award_rule_measure" AS ENUM('event_count', 'spp_sum');--> statement-breakpoint
CREATE TYPE "game_data"."trophy_award_rule_role" AS ENUM('acting', 'consequence');--> statement-breakpoint
CREATE TABLE "game_data"."trophy_award_rule_eligible_positions" (
	"id" serial PRIMARY KEY,
	"trophy_id" integer NOT NULL,
	"position_name_external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "trophy_award_rule_eligible_positions_trophy_position_unique" UNIQUE("trophy_id","position_name_external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."trophy_award_rule_eligible_positions_history" (LIKE "game_data"."trophy_award_rule_eligible_positions");
--> statement-breakpoint
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
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_kind" "game_data"."trophy_award_rule_kind" DEFAULT 'direct_source'::"game_data"."trophy_award_rule_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_procedure" varchar(1024) DEFAULT 'Recorded by the source importer.';--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_role" "game_data"."trophy_award_rule_role";--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_tie_cutoff" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_threshold" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "award_rule_measure" "game_data"."trophy_award_rule_measure";--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_kind" "game_data"."trophy_award_rule_kind";--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_procedure" varchar(1024);--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_role" "game_data"."trophy_award_rule_role";--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_tie_cutoff" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_threshold" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "award_rule_measure" "game_data"."trophy_award_rule_measure";--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_eligible_positions" ADD CONSTRAINT "trophy_award_rule_eligible_positions_trophy_id_trophies_id_fkey" FOREIGN KEY ("trophy_id") REFERENCES "game_data"."trophies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_excluded_match_event_types" ADD CONSTRAINT "trophy_award_rule_excluded_match_event_types_ocNF06vT5NvX_fkey" FOREIGN KEY ("trophy_id") REFERENCES "game_data"."trophies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_match_event_types" ADD CONSTRAINT "trophy_award_rule_match_event_types_trophy_id_trophies_id_fkey" FOREIGN KEY ("trophy_id") REFERENCES "game_data"."trophies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD CONSTRAINT "trophies_award_rule" CHECK ((
        "award_rule_kind" IN ('direct_source', 'manual')
        AND "award_procedure" IS NOT NULL
        AND "award_rule_role" IS NULL
        AND "award_rule_tie_cutoff" IS NULL
        AND "award_rule_threshold" IS NULL
        AND "award_rule_measure" IS NULL
      ) OR (
        "award_rule_kind" IN ('max_count', 'max_spp_sum')
        AND "recipient_kind" = 'player'
        AND "award_procedure" IS NULL
        AND "award_rule_role" IS NOT NULL
        AND "award_rule_tie_cutoff" IS NOT NULL
        AND "award_rule_threshold" IS NULL
        AND "award_rule_measure" IS NULL
      ) OR (
        "award_rule_kind" = 'career_threshold'
        AND "recipient_kind" = 'player'
        AND "award_procedure" IS NULL
        AND "award_rule_role" IS NOT NULL
        AND "award_rule_tie_cutoff" IS NULL
        AND "award_rule_threshold" IS NOT NULL
        AND "award_rule_measure" IS NOT NULL
      ));
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_eligible_positions_history" ADD CONSTRAINT "trophy_award_rule_eligible_positions_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_eligible_positions_history" ADD CONSTRAINT "trophy_award_rule_eligible_positions_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."trophy_award_rule_eligible_positions"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_award_rule_eligible_positions_versioning ON "game_data"."trophy_award_rule_eligible_positions";
--> statement-breakpoint
CREATE TRIGGER trophy_award_rule_eligible_positions_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."trophy_award_rule_eligible_positions"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.trophy_award_rule_eligible_positions_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_award_rule_eligible_positions_set_updated_at ON "game_data"."trophy_award_rule_eligible_positions";
--> statement-breakpoint
CREATE TRIGGER trophy_award_rule_eligible_positions_set_updated_at
  BEFORE UPDATE ON "game_data"."trophy_award_rule_eligible_positions"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
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
