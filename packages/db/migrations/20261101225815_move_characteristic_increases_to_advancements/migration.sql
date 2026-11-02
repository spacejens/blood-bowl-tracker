-- Every counted characteristic increase becomes its own advancement row, of
-- unknown and unconfirmed order: the counts never recorded a sequence. A
-- player who already has increase rows is left alone. The history triggers
-- record each new row. Rows are written in characteristic order (the enum's
-- MA, ST, AG, PA, AV), so ids list a player's increases in that order.
INSERT INTO "game_data"."player_advancements" ("player_id", "source", "characteristic")
SELECT p."id", 'characteristic', c."characteristic"::"game_data"."player_characteristic"
FROM "game_data"."players" AS p
CROSS JOIN LATERAL (VALUES
  ('MA', p."move_increase_count"),
  ('ST', p."strength_increase_count"),
  ('AG', p."agility_increase_count"),
  ('PA', p."passing_increase_count"),
  ('AV', p."armour_increase_count")
) AS c("characteristic", "count")
CROSS JOIN LATERAL generate_series(1, c."count") AS g("n")
WHERE NOT EXISTS (
  SELECT 1 FROM "game_data"."player_advancements" AS pa
  WHERE pa."player_id" = p."id" AND pa."source" = 'characteristic'
)
ORDER BY p."id", c."characteristic"::"game_data"."player_characteristic", g."n";--> statement-breakpoint
ALTER TABLE "game_data"."players" DROP COLUMN "move_increase_count";--> statement-breakpoint
ALTER TABLE "game_data"."players" DROP COLUMN "strength_increase_count";--> statement-breakpoint
ALTER TABLE "game_data"."players" DROP COLUMN "agility_increase_count";--> statement-breakpoint
ALTER TABLE "game_data"."players" DROP COLUMN "passing_increase_count";--> statement-breakpoint
ALTER TABLE "game_data"."players" DROP COLUMN "armour_increase_count";--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ALTER COLUMN "move_increase_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ALTER COLUMN "strength_increase_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ALTER COLUMN "agility_increase_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ALTER COLUMN "passing_increase_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ALTER COLUMN "armour_increase_count" DROP NOT NULL;