CREATE TABLE "game_data"."positions_race_eras" (
	"id" serial PRIMARY KEY,
	"position_id" integer NOT NULL,
	"race_era_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "positions_race_eras_position_id_race_era_id_unique" UNIQUE("position_id","race_era_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."positions_race_eras_history" (LIKE "game_data"."positions_race_eras");
--> statement-breakpoint
ALTER TABLE "game_data"."positions_races_history" DROP CONSTRAINT "positions_races_history_id_fkey";--> statement-breakpoint
DROP TABLE "game_data"."positions_races";--> statement-breakpoint
DROP TABLE "game_data"."positions_races_history";--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras" ADD CONSTRAINT "positions_race_eras_position_id_positions_id_fkey" FOREIGN KEY ("position_id") REFERENCES "game_data"."positions"("id");--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras" ADD CONSTRAINT "positions_race_eras_race_era_id_race_eras_id_fkey" FOREIGN KEY ("race_era_id") REFERENCES "game_data"."race_eras"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras_history" ADD CONSTRAINT "positions_race_eras_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras_history" ADD CONSTRAINT "positions_race_eras_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."positions_race_eras"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS positions_race_eras_versioning ON "game_data"."positions_race_eras";
--> statement-breakpoint
CREATE TRIGGER positions_race_eras_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."positions_race_eras"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.positions_race_eras_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS positions_race_eras_set_updated_at ON "game_data"."positions_race_eras";
--> statement-breakpoint
CREATE TRIGGER positions_race_eras_set_updated_at
  BEFORE UPDATE ON "game_data"."positions_race_eras"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
