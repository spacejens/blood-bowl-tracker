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
ALTER TABLE "game_data"."competitions" ADD COLUMN "competition_group_id" integer NOT NULL;
--> statement-breakpoint
-- competitions_history.competition_group_id intentionally stays nullable:
-- history rows predating this migration can never be backfilled, since history
-- snapshots are immutable. See rewriteHistorySetNotNull in db-generate.ts.
ALTER TABLE "game_data"."competitions_history" ADD COLUMN "competition_group_id" integer;
--> statement-breakpoint
ALTER TABLE "game_data"."competitions" ADD CONSTRAINT "competitions_competition_group_id_competition_groups_id_fkey" FOREIGN KEY ("competition_group_id") REFERENCES "game_data"."competition_groups"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "competition_group_id" integer NOT NULL;
--> statement-breakpoint
-- trophies_history.competition_group_id intentionally stays nullable:
-- history rows predating this migration can never be backfilled, since history
-- snapshots are immutable. See rewriteHistorySetNotNull in db-generate.ts.
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "competition_group_id" integer;
--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD CONSTRAINT "trophies_competition_group_id_competition_groups_id_fkey" FOREIGN KEY ("competition_group_id") REFERENCES "game_data"."competition_groups"("id");
