CREATE TYPE "game_data"."trophy_recipient_kind" AS ENUM('team', 'player');--> statement-breakpoint
CREATE TABLE "game_data"."trophies" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"recipient_kind" "game_data"."trophy_recipient_kind" NOT NULL,
	"description" varchar(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_data"."trophies_history" (LIKE "game_data"."trophies");
--> statement-breakpoint
CREATE TABLE "game_data"."trophy_awards" (
	"id" serial PRIMARY KEY,
	"trophy_id" integer NOT NULL,
	"competition_id" integer NOT NULL,
	"team_era_id" integer NOT NULL,
	"player_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_data"."trophy_awards_history" (LIKE "game_data"."trophy_awards");
--> statement-breakpoint
CREATE TABLE "game_data"."trophies_external_ids" (
	"id" serial PRIMARY KEY,
	"trophy_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "trophies_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."trophies_external_ids_history" (LIKE "game_data"."trophies_external_ids");
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_awards" ADD CONSTRAINT "trophy_awards_trophy_id_trophies_id_fkey" FOREIGN KEY ("trophy_id") REFERENCES "game_data"."trophies"("id");--> statement-breakpoint
ALTER TABLE "game_data"."trophy_awards" ADD CONSTRAINT "trophy_awards_competition_id_competitions_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "game_data"."competitions"("id");--> statement-breakpoint
ALTER TABLE "game_data"."trophy_awards" ADD CONSTRAINT "trophy_awards_team_era_id_team_eras_id_fkey" FOREIGN KEY ("team_era_id") REFERENCES "game_data"."team_eras"("id");--> statement-breakpoint
ALTER TABLE "game_data"."trophy_awards" ADD CONSTRAINT "trophy_awards_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "game_data"."players"("id");--> statement-breakpoint
ALTER TABLE "game_data"."trophies_external_ids" ADD CONSTRAINT "trophies_external_ids_trophy_id_trophies_id_fkey" FOREIGN KEY ("trophy_id") REFERENCES "game_data"."trophies"("id");--> statement-breakpoint
ALTER TABLE "game_data"."trophies_external_ids" ADD CONSTRAINT "trophies_external_ids_gKLqZrJhrU4A_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD CONSTRAINT "trophies_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD CONSTRAINT "trophies_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."trophies"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophies_versioning ON "game_data"."trophies";
--> statement-breakpoint
CREATE TRIGGER trophies_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."trophies"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.trophies_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophies_set_updated_at ON "game_data"."trophies";
--> statement-breakpoint
CREATE TRIGGER trophies_set_updated_at
  BEFORE UPDATE ON "game_data"."trophies"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_awards_history" ADD CONSTRAINT "trophy_awards_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_awards_history" ADD CONSTRAINT "trophy_awards_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."trophy_awards"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_awards_versioning ON "game_data"."trophy_awards";
--> statement-breakpoint
CREATE TRIGGER trophy_awards_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."trophy_awards"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.trophy_awards_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_awards_set_updated_at ON "game_data"."trophy_awards";
--> statement-breakpoint
CREATE TRIGGER trophy_awards_set_updated_at
  BEFORE UPDATE ON "game_data"."trophy_awards"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."trophies_external_ids_history" ADD CONSTRAINT "trophies_external_ids_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."trophies_external_ids_history" ADD CONSTRAINT "trophies_external_ids_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."trophies_external_ids"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophies_external_ids_versioning ON "game_data"."trophies_external_ids";
--> statement-breakpoint
CREATE TRIGGER trophies_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."trophies_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.trophies_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophies_external_ids_set_updated_at ON "game_data"."trophies_external_ids";
--> statement-breakpoint
CREATE TRIGGER trophies_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."trophies_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
