CREATE TYPE "game_data"."advancement_kind" AS ENUM('table_roll');--> statement-breakpoint
CREATE TABLE "game_data"."advancement_costs" (
	"id" serial PRIMARY KEY,
	"rules_set_id" integer NOT NULL,
	"advancement_number" integer NOT NULL,
	"advancement_kind" "game_data"."advancement_kind" NOT NULL,
	"spp_cost" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "advancement_costs_rules_set_number_kind_unique" UNIQUE("rules_set_id","advancement_number","advancement_kind"),
	CONSTRAINT "advancement_costs_advancement_number_positive" CHECK ("advancement_number" > 0),
	CONSTRAINT "advancement_costs_spp_cost_positive" CHECK ("spp_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "game_data"."advancement_costs_history" (LIKE "game_data"."advancement_costs");
--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs" ADD CONSTRAINT "advancement_costs_rules_set_id_rules_sets_id_fkey" FOREIGN KEY ("rules_set_id") REFERENCES "game_data"."rules_sets"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs_history" ADD CONSTRAINT "advancement_costs_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs_history" ADD CONSTRAINT "advancement_costs_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."advancement_costs"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS advancement_costs_versioning ON "game_data"."advancement_costs";
--> statement-breakpoint
CREATE TRIGGER advancement_costs_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."advancement_costs"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.advancement_costs_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS advancement_costs_set_updated_at ON "game_data"."advancement_costs";
--> statement-breakpoint
CREATE TRIGGER advancement_costs_set_updated_at
  BEFORE UPDATE ON "game_data"."advancement_costs"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
