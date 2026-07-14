CREATE TABLE "game_data"."era_rules_sets" (
	"id" serial PRIMARY KEY,
	"era_id" integer NOT NULL,
	"rules_set_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "era_rules_sets_era_id_rules_set_id_unique" UNIQUE("era_id","rules_set_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."era_rules_sets_history" (LIKE "game_data"."era_rules_sets");
--> statement-breakpoint
CREATE TABLE "game_data"."race_eras" (
	"id" serial PRIMARY KEY,
	"race_id" integer NOT NULL,
	"era_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "race_eras_race_id_era_id_unique" UNIQUE("race_id","era_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."race_eras_history" (LIKE "game_data"."race_eras");
--> statement-breakpoint
ALTER TABLE "game_data"."eras" DROP CONSTRAINT "eras_rules_set_id_rules_sets_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets_history" DROP CONSTRAINT "race_rules_sets_history_id_race_rules_sets_id_fkey";--> statement-breakpoint
DROP TABLE "game_data"."race_rules_sets";--> statement-breakpoint
DROP TABLE "game_data"."race_rules_sets_history";--> statement-breakpoint
ALTER TABLE "game_data"."eras" DROP COLUMN "rules_set_id";--> statement-breakpoint
ALTER TABLE "game_data"."eras_history" ALTER COLUMN "rules_set_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."era_rules_sets" ADD CONSTRAINT "era_rules_sets_era_id_eras_id_fkey" FOREIGN KEY ("era_id") REFERENCES "game_data"."eras"("id");--> statement-breakpoint
ALTER TABLE "game_data"."era_rules_sets" ADD CONSTRAINT "era_rules_sets_rules_set_id_rules_sets_id_fkey" FOREIGN KEY ("rules_set_id") REFERENCES "game_data"."rules_sets"("id");--> statement-breakpoint
ALTER TABLE "game_data"."race_eras" ADD CONSTRAINT "race_eras_race_id_races_id_fkey" FOREIGN KEY ("race_id") REFERENCES "game_data"."races"("id");--> statement-breakpoint
ALTER TABLE "game_data"."race_eras" ADD CONSTRAINT "race_eras_era_id_eras_id_fkey" FOREIGN KEY ("era_id") REFERENCES "game_data"."eras"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."era_rules_sets_history" ADD CONSTRAINT "era_rules_sets_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."era_rules_sets_history" ADD CONSTRAINT "era_rules_sets_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."era_rules_sets"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS era_rules_sets_versioning ON "game_data"."era_rules_sets";
--> statement-breakpoint
CREATE TRIGGER era_rules_sets_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."era_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.era_rules_sets_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS era_rules_sets_set_updated_at ON "game_data"."era_rules_sets";
--> statement-breakpoint
CREATE TRIGGER era_rules_sets_set_updated_at
  BEFORE UPDATE ON "game_data"."era_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."race_eras_history" ADD CONSTRAINT "race_eras_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."race_eras_history" ADD CONSTRAINT "race_eras_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."race_eras"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS race_eras_versioning ON "game_data"."race_eras";
--> statement-breakpoint
CREATE TRIGGER race_eras_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."race_eras"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.race_eras_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS race_eras_set_updated_at ON "game_data"."race_eras";
--> statement-breakpoint
CREATE TRIGGER race_eras_set_updated_at
  BEFORE UPDATE ON "game_data"."race_eras"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
