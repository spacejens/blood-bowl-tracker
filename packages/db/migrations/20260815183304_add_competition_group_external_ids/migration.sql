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
-- No SET CONSTRAINTS ALL DEFERRED needed here, unlike 20260814121026: drizzle
-- always runs every pending migration in one single db.transaction() (see
-- drizzle-orm's pg-core/async/session.js), and SET CONSTRAINTS is
-- transaction-scoped. Either this migration runs in the same transaction as
-- 20260814121026 -- whose own reset (needed there because it's the first
-- history-tracked insert after the admin migration's SET CONSTRAINTS ALL
-- IMMEDIATE) already covers everything after it in that same transaction --
-- or it runs alone in a later transaction, in which case the admin
-- migration's IMMEDIATE setting never carried over to begin with, since
-- 20260721101504 already committed in its own, separate, already-finished
-- transaction.
-- Give every pre-existing competition_groups row a "Name" external id. That
-- includes at minimum the "Major Season" group seeded by
-- 20260814121026_add_competition_groups -- which predates competition groups
-- having external ids at all -- but also covers a developer database where the
-- old, pre-#445-rework manual importer already ran a name-matched upsert and
-- created all 16 curated groups without any external id. Now that
-- CompetitionGroupsService.upsert matches by external id (never by name), any
-- such row is invisible to tools/import-manual's competition-groups.json5
-- upsert, which would create a duplicate of it on the next import -- exactly
-- the duplication bug the leagues seed above already had to fix, but for
-- every group rather than only the one this migration's own seed knows about.
-- The id string is what NameExternalIdService.forCompetitionGroup produces:
-- the group's plain name. DISTINCT ON guards against violating the unique
-- constraint on (external_system_id, external_id) if two rows somehow shared
-- a name. The external system is inserted conditionally because an
-- already-imported database has it; the external id likewise, so re-running
-- against such a database -- or one that never had the old data at all -- is
-- a no-op.
INSERT INTO "game_data"."external_systems" ("name", "category")
SELECT 'Name', 'bookkeeping'
WHERE NOT EXISTS (
  SELECT 1 FROM "game_data"."external_systems" WHERE "name" = 'Name'
);
--> statement-breakpoint
INSERT INTO "game_data"."competition_groups_external_ids" ("competition_group_id", "external_system_id", "external_id")
SELECT DISTINCT ON (cg."name") cg."id", es."id", cg."name"
FROM "game_data"."competition_groups" cg, "game_data"."external_systems" es
WHERE es."name" = 'Name'
AND NOT EXISTS (
  SELECT 1 FROM "game_data"."competition_groups_external_ids"
  WHERE "external_system_id" = es."id" AND "external_id" = cg."name"
)
ORDER BY cg."name", cg."id";
