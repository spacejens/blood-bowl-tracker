CREATE TABLE "game_data"."competition_groups_external_ids" (
	"id" serial PRIMARY KEY,
	"competition_group_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "competition_groups_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."competition_groups_external_ids_history" (LIKE "game_data"."competition_groups_external_ids");
--> statement-breakpoint
ALTER TABLE "game_data"."competition_groups_external_ids" ADD CONSTRAINT "competition_groups_external_ids_6uMWuARkz2kY_fkey" FOREIGN KEY ("competition_group_id") REFERENCES "game_data"."competition_groups"("id");--> statement-breakpoint
ALTER TABLE "game_data"."competition_groups_external_ids" ADD CONSTRAINT "competition_groups_external_ids_x9Bi4IhYSLGs_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."competition_groups_external_ids_history" ADD CONSTRAINT "competition_groups_external_ids_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."competition_groups_external_ids_history" ADD CONSTRAINT "competition_groups_external_ids_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."competition_groups_external_ids"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_groups_external_ids_versioning ON "game_data"."competition_groups_external_ids";
--> statement-breakpoint
CREATE TRIGGER competition_groups_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."competition_groups_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.competition_groups_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_groups_external_ids_set_updated_at ON "game_data"."competition_groups_external_ids";
--> statement-breakpoint
CREATE TRIGGER competition_groups_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."competition_groups_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
-- Same reason as 20260814121026_add_competition_groups: an earlier migration
-- in the same batch (20260721101504_admin_match_event_review_fixes) leaves
-- SET CONSTRAINTS ALL IMMEDIATE in effect for the whole transaction, which
-- would make the *_history self-referencing FK -- written by a BEFORE INSERT
-- trigger before its own tracked row physically exists -- fail with a bogus FK
-- violation on the seed insert below. Restore the default DEFERRED behavior
-- unconditionally.
SET CONSTRAINTS ALL DEFERRED;
--> statement-breakpoint
-- Give the "Major Season" group seeded by 20260814121026_add_competition_groups
-- its "Name" external id. That seed predates competition groups having external
-- ids at all; now that CompetitionGroupsService.upsert matches by external id
-- (never by name), a seeded row with no external id is invisible to
-- tools/import-manual's competition-groups.json5 upsert, which would create a
-- second "Major Season" on every fresh database -- exactly the duplication bug
-- the leagues seed above it already had to fix. The id string is what
-- NameExternalIdService.forCompetitionGroup produces: the group's plain name.
-- The external system is inserted conditionally because an already-imported
-- database has it; the external id likewise, so re-running against such a
-- database is a no-op.
INSERT INTO "game_data"."external_systems" ("name", "category")
SELECT 'Name', 'bookkeeping'
WHERE NOT EXISTS (
  SELECT 1 FROM "game_data"."external_systems" WHERE "name" = 'Name'
);
--> statement-breakpoint
INSERT INTO "game_data"."competition_groups_external_ids" ("competition_group_id", "external_system_id", "external_id")
SELECT cg."id", es."id", 'Major Season'
FROM "game_data"."competition_groups" cg, "game_data"."external_systems" es
WHERE cg."name" = 'Major Season' AND es."name" = 'Name'
AND NOT EXISTS (
  SELECT 1 FROM "game_data"."competition_groups_external_ids"
  WHERE "external_system_id" = es."id" AND "external_id" = 'Major Season'
)
ORDER BY cg."id"
LIMIT 1;
