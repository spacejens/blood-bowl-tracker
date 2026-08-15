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
-- A prior migration (20260721101504_admin_match_event_review_fixes) issues
-- SET CONSTRAINTS ALL IMMEDIATE for its own unrelated column-type change,
-- which is a transaction-scoped setting: on a database that has never run
-- any migration before (drizzle-kit applies the full backlog as one
-- transaction), that statement is still in effect here and would flip the
-- leagues_history/competition_groups_history self-referencing FKs from
-- DEFERRABLE INITIALLY DEFERRED to checked-per-statement. Each history row
-- below is written by a BEFORE INSERT trigger before its own tracked row
-- physically exists, so an immediate check fails with a bogus FK violation.
-- Restoring the default DEFERRED behavior here, unconditionally, makes this
-- migration's own seed inserts correct regardless of what any earlier
-- migration in the same batch left behind.
SET CONSTRAINTS ALL DEFERRED;
--> statement-breakpoint
-- Seed the real tLoEG league and Major Season competition group (issue #445).
-- Both are retained data, not throwaway placeholders: they are the same rows
-- tools/import-manual's leagues.json5 and competition-groups.json5 upsert onto
-- by external id (upsertByExternalIds never matches by name), so this seed
-- must give the league the exact `tloeg.bbleague.se`:`tLoEG` external id pair
-- leagues.json5 declares -- a name-only seed row has nothing for that upsert
-- to match against and gets duplicated by it on a fresh database. Both the
-- league and its external system are conditional because an already-imported
-- database has them; competition_groups is brand new here, so the Major
-- Season row is deterministically id 1 -- which is what the two DEFAULT 1
-- columns below (and their .default(1) in packages/db/src/schema) refer to.
INSERT INTO "game_data"."external_systems" ("name", "category")
SELECT 'tloeg.bbleague.se', 'imported_data_source'
WHERE NOT EXISTS (
  SELECT 1 FROM "game_data"."external_systems" WHERE "name" = 'tloeg.bbleague.se'
);
--> statement-breakpoint
INSERT INTO "game_data"."leagues" ("name")
SELECT 'tLoEG'
WHERE NOT EXISTS (
  SELECT 1 FROM "game_data"."leagues" WHERE "name" = 'tLoEG'
);
--> statement-breakpoint
INSERT INTO "game_data"."leagues_external_ids" ("league_id", "external_system_id", "external_id")
SELECT l."id", es."id", 'tLoEG'
FROM "game_data"."leagues" l, "game_data"."external_systems" es
WHERE l."name" = 'tLoEG' AND es."name" = 'tloeg.bbleague.se'
AND NOT EXISTS (
  SELECT 1 FROM "game_data"."leagues_external_ids"
  WHERE "league_id" = l."id" AND "external_system_id" = es."id"
);
--> statement-breakpoint
INSERT INTO "game_data"."competition_groups" ("name", "league_id")
SELECT 'Major Season', "id"
FROM "game_data"."leagues"
WHERE "name" = 'tLoEG'
ORDER BY "id"
LIMIT 1;
--> statement-breakpoint
ALTER TABLE "game_data"."competitions" ADD COLUMN "competition_group_id" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- competitions_history.competition_group_id intentionally stays nullable:
-- history rows predating this migration can never be backfilled, since history
-- snapshots are immutable. See rewriteHistorySetNotNull in db-generate.ts.
ALTER TABLE "game_data"."competitions_history" ADD COLUMN "competition_group_id" integer;
--> statement-breakpoint
ALTER TABLE "game_data"."competitions" ADD CONSTRAINT "competitions_competition_group_id_competition_groups_id_fkey" FOREIGN KEY ("competition_group_id") REFERENCES "game_data"."competition_groups"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD COLUMN "competition_group_id" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- trophies_history.competition_group_id intentionally stays nullable:
-- history rows predating this migration can never be backfilled, since history
-- snapshots are immutable. See rewriteHistorySetNotNull in db-generate.ts.
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "competition_group_id" integer;
--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD CONSTRAINT "trophies_competition_group_id_competition_groups_id_fkey" FOREIGN KEY ("competition_group_id") REFERENCES "game_data"."competition_groups"("id");
