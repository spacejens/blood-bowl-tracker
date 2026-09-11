-- Temporary deployment aid, the counterpart of award_rule_kind's default: an
-- insert made by an app release that predates both columns names neither, so
-- award_rule_kind defaults to 'direct_source' while award_procedure stays
-- null, a combination the trophies_award_rule check rejects. The placeholder
-- sentence is the one this column's own backfill used, and
-- tools/import-manual overwrites it with the real curated procedure on its
-- next run. Drop this default together with award_rule_kind's, once every
-- deployment runs app code that always supplies both.
ALTER TABLE "game_data"."trophies" ALTER COLUMN "award_procedure" SET DEFAULT 'Recorded by the source importer.';
