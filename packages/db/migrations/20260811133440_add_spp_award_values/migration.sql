CREATE TABLE "game_data"."spp_award_values" (
	"id" serial PRIMARY KEY,
	"rules_set_id" integer NOT NULL,
	"race_id" integer,
	"action_type" "game_data"."action_type" NOT NULL,
	"spp_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "spp_award_values_rules_set_race_action_unique" UNIQUE NULLS NOT DISTINCT("rules_set_id","race_id","action_type")
);
--> statement-breakpoint
CREATE TABLE "game_data"."spp_award_values_history" (LIKE "game_data"."spp_award_values");
--> statement-breakpoint
ALTER TABLE "game_data"."spp_award_values" ADD CONSTRAINT "spp_award_values_rules_set_id_rules_sets_id_fkey" FOREIGN KEY ("rules_set_id") REFERENCES "game_data"."rules_sets"("id");--> statement-breakpoint
ALTER TABLE "game_data"."spp_award_values" ADD CONSTRAINT "spp_award_values_race_id_races_id_fkey" FOREIGN KEY ("race_id") REFERENCES "game_data"."races"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."spp_award_values_history" ADD CONSTRAINT "spp_award_values_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."spp_award_values_history" ADD CONSTRAINT "spp_award_values_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."spp_award_values"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS spp_award_values_versioning ON "game_data"."spp_award_values";
--> statement-breakpoint
CREATE TRIGGER spp_award_values_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."spp_award_values"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.spp_award_values_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS spp_award_values_set_updated_at ON "game_data"."spp_award_values";
--> statement-breakpoint
CREATE TRIGGER spp_award_values_set_updated_at
  BEFORE UPDATE ON "game_data"."spp_award_values"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
