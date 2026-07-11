CREATE TABLE "game_data"."positions_races" (
	"id" serial PRIMARY KEY,
	"position_id" integer NOT NULL,
	"race_id" integer NOT NULL,
	"is_deleted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "positions_races_position_id_race_id_unique" UNIQUE("position_id","race_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."positions_races_history" (LIKE "game_data"."positions_races");
--> statement-breakpoint
ALTER TABLE "game_data"."positions" DROP CONSTRAINT "positions_race_id_races_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."positions" ADD COLUMN "is_star_player" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions_history" ADD COLUMN "is_star_player" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions" DROP COLUMN "race_id";--> statement-breakpoint
ALTER TABLE "game_data"."positions_history" ALTER COLUMN "race_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions_races" ADD CONSTRAINT "positions_races_position_id_positions_id_fkey" FOREIGN KEY ("position_id") REFERENCES "game_data"."positions"("id");--> statement-breakpoint
ALTER TABLE "game_data"."positions_races" ADD CONSTRAINT "positions_races_race_id_races_id_fkey" FOREIGN KEY ("race_id") REFERENCES "game_data"."races"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."positions_races_history" ADD CONSTRAINT "positions_races_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."positions_races_history" ADD CONSTRAINT "positions_races_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."positions_races"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS positions_races_versioning ON "game_data"."positions_races";
--> statement-breakpoint
CREATE TRIGGER positions_races_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."positions_races"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.positions_races_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS positions_races_set_updated_at ON "game_data"."positions_races";
--> statement-breakpoint
CREATE TRIGGER positions_races_set_updated_at
  BEFORE UPDATE ON "game_data"."positions_races"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
