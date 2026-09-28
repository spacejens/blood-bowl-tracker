-- Every competition group now carries a name pattern. Backfill the four
-- groups curated with one most recently, so a database not yet re-imported
-- from the updated curated file still satisfies the NOT NULL below. Each
-- UPDATE only fills a missing pattern; any other group still lacking one
-- fails the migration loudly rather than being silently patched.
-- competition_groups_history.name_pattern deliberately stays nullable:
-- history rows are immutable snapshots that can never be backfilled, so
-- db-generate's rewriteHistorySetNotNull strips its SET NOT NULL.
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEGBBL[\s-]*)?Fright Night(?:\s*\d+)?$' WHERE "name" = 'Fright Night' AND "name_pattern" IS NULL;--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEGBBL[\s-]*)?Snöbollskrieg(?:\s*\d+)?$' WHERE "name" = 'Snöbollskrieg' AND "name_pattern" IS NULL;--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEGBBL[\s-]*)?Blitzmania!?(?:\s*\d+)?$' WHERE "name" = 'Blitzmania!' AND "name_pattern" IS NULL;--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEGBBL[\s-]*)?Champions? of tLoEG(?:\s*\d+)?$' WHERE "name" = 'Champion of tLoEG' AND "name_pattern" IS NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competition_groups" ALTER COLUMN "name_pattern" SET NOT NULL;
