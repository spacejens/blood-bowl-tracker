CREATE TABLE "game_data"."competition_groups" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"league_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_data"."competition_groups_history" (LIKE "game_data"."competition_groups");
--> statement-breakpoint
ALTER TABLE "game_data"."competition_groups" ADD CONSTRAINT "competition_groups_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "game_data"."leagues"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."competition_groups_history" ADD CONSTRAINT "competition_groups_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."competition_groups_history" ADD CONSTRAINT "competition_groups_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."competition_groups"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_groups_versioning ON "game_data"."competition_groups";
--> statement-breakpoint
CREATE TRIGGER competition_groups_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."competition_groups"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.competition_groups_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_groups_set_updated_at ON "game_data"."competition_groups";
--> statement-breakpoint
CREATE TRIGGER competition_groups_set_updated_at
  BEFORE UPDATE ON "game_data"."competition_groups"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
-- No DEFAULT is provided here deliberately: this column is a real
-- classification that every competition and trophy must have, not a
-- placeholder value to backfill existing rows with. That means this
-- ALTER only applies cleanly to a competitions/trophies table with zero
-- existing rows. If this statement fails with a NOT-NULL violation, the
-- local database needs recreating from empty (e.g. `docker compose down
-- -v`) rather than "fixed" by re-adding a default.
ALTER TABLE "game_data"."competitions" ADD COLUMN "competition_group_id" integer NOT NULL;
--> statement-breakpoint
-- competitions_history.competition_group_id is tightened alongside its
-- tracked column, as a one-time catch-up: normally a fresh history column
-- added here would stay nullable (pre-existing history rows predating this
-- migration could never be backfilled, since history snapshots are
-- immutable -- see rewriteHistorySetNotNull in db-generate.ts). That does
-- not apply here, made safe by the coordinated database drop and re-import
-- in issue #448, which leaves zero pre-existing history rows for this
-- column to ever have been missing from.
ALTER TABLE "game_data"."competitions_history" ADD COLUMN "competition_group_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "game_data"."competitions" ADD CONSTRAINT "competitions_competition_group_id_competition_groups_id_fkey" FOREIGN KEY ("competition_group_id") REFERENCES "game_data"."competition_groups"("id");
--> statement-breakpoint
-- No DEFAULT here either, for the same reason as competitions above:
-- this only applies cleanly to a trophies table with zero existing rows.
ALTER TABLE "game_data"."trophies" ADD COLUMN "competition_group_id" integer NOT NULL;
--> statement-breakpoint
-- trophies_history.competition_group_id intentionally stays nullable:
-- history rows predating this migration can never be backfilled, since history
-- snapshots are immutable. See rewriteHistorySetNotNull in db-generate.ts.
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "competition_group_id" integer;
--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD CONSTRAINT "trophies_competition_group_id_competition_groups_id_fkey" FOREIGN KEY ("competition_group_id") REFERENCES "game_data"."competition_groups"("id");
