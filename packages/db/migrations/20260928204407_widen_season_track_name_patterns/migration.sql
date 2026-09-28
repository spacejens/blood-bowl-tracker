-- Major Season and Minor Season accept any tLoEG-style league prefix
-- ("tLoEGBBL", "tLoEG Blood Bowl League", ...): "tLoEG" followed by
-- letters, spaces and dashes that never contain another season-style
-- track's word, so no name can match two groups. These are the same
-- patterns as tools/import-manual/data/before-other-importers/competition-groups.json5,
-- written here so a database not yet re-imported from that file
-- classifies new competitions correctly. The history triggers record the
-- change.
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:(?!Minor|Dungeon)[\p{L}\s-])*)?(?:Major Season|Season|Säsong)\s*\d+$' WHERE "name" = 'Major Season';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:(?!Major|Dungeon)[\p{L}\s-])*)?(?:Minor Season|Korpen)\s*\d+$' WHERE "name" = 'Minor Season';
