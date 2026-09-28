-- Every tLoEG group other than Major Season and Minor Season accepts exactly
-- the two known spellings of the optional league prefix: "tLoEGBBL" and
-- "tLoEG Blood Bowl League". These are the same patterns as
-- tools/import-manual/data/before-other-importers/competition-groups.json5,
-- written here so a database not yet re-imported from that file classifies
-- new competitions correctly. The history triggers record the change.
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Chaos Cup(?:\s*\d+)?$' WHERE "name" = 'Chaos Cup';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Stunty Leeg(?:\s*\d+)?$' WHERE "name" = 'Stunty Leeg';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Fright Night(?:\s*\d+)?$' WHERE "name" = 'Fright Night';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Snöbollskrieg(?:\s*\d+)?$' WHERE "name" = 'Snöbollskrieg';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Moot Mania(?:\s*\d+)?$' WHERE "name" = 'Moot Mania';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Champions? of tLoEG(?:\s*\d+)?$' WHERE "name" = 'Champion of tLoEG';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?NAA(?:\s*\d+)?$' WHERE "name" = 'NAA';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Blitzmania!?(?:\s*\d+)?$' WHERE "name" = 'Blitzmania!';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^[\s-]*(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Ogretoberfest(?:\s*\d+)?[\s-]*$' WHERE "name" = 'Ogretoberfest';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Dungeon Bowl(?:\s+Season)?(?:\s*\d+)?$' WHERE "name" = 'Dungeon Bowl';--> statement-breakpoint
UPDATE "game_data"."competition_groups" SET "name_pattern" = '^(?:tLoEG(?:BBL|\s+Blood\s+Bowl\s+League)[\s-]*)?Reserves Rumble(?:\s*\d+)?$' WHERE "name" = 'Reserves Rumble';
