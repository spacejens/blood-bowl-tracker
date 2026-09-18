CREATE TYPE "game_data"."player_skill_source" AS ENUM('starting', 'chosen', 'random');--> statement-breakpoint
CREATE TABLE "game_data"."player_skills" (
	"id" serial PRIMARY KEY,
	"player_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"source" "game_data"."player_skill_source" NOT NULL,
	"attribute_value" text,
	"advancement_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "player_skills_player_id_skill_id_attribute_value_unique" UNIQUE NULLS NOT DISTINCT("player_id","skill_id","attribute_value")
);
--> statement-breakpoint
CREATE TABLE "game_data"."player_skills_history" (LIKE "game_data"."player_skills");
--> statement-breakpoint
ALTER TABLE "game_data"."player_skills" ADD CONSTRAINT "player_skills_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "game_data"."players"("id");--> statement-breakpoint
ALTER TABLE "game_data"."player_skills" ADD CONSTRAINT "player_skills_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "game_data"."skills"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."player_skills_history" ADD CONSTRAINT "player_skills_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."player_skills_history" ADD CONSTRAINT "player_skills_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."player_skills"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS player_skills_versioning ON "game_data"."player_skills";
--> statement-breakpoint
CREATE TRIGGER player_skills_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."player_skills"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.player_skills_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS player_skills_set_updated_at ON "game_data"."player_skills";
--> statement-breakpoint
CREATE TRIGGER player_skills_set_updated_at
  BEFORE UPDATE ON "game_data"."player_skills"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
