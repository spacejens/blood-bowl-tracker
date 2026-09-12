-- Both defaults exist only so the previous migration's ADD COLUMNs are safe
-- against a trophies table that already has rows: award_rule_kind is NOT NULL,
-- and the trophies_award_rule check added alongside it requires a non-null
-- award_procedure for the direct_source rows the default produces. Once those
-- pre-existing rows are populated the defaults have no further purpose, and
-- keeping them would let an uncurated trophy silently classify as
-- direct_source instead of failing loudly, so they are dropped here. The
-- placeholder procedure sentence is overwritten with the real curated one by
-- tools/import-manual on its next run.
ALTER TABLE "game_data"."trophies" ALTER COLUMN "award_rule_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ALTER COLUMN "award_procedure" DROP DEFAULT;