-- BBL's Skills cell lists a player's advancements in the order they were
-- taken, so a numbered paid advancement of a player BBL alone describes (a
-- BBL external id and no TP one) is confirmed. Starting skills, free extras,
-- removed rows and rows with no number are left alone. The history triggers
-- record each change.
UPDATE "game_data"."player_advancements" AS pa
SET "order_confirmed" = true
WHERE pa."order_confirmed" = false
  AND pa."advancement_order" IS NOT NULL
  AND pa."source" <> 'starting'
  AND pa."is_free_extra" = false
  AND pa."removed" = false
  AND EXISTS (
    SELECT 1
    FROM "game_data"."players_external_ids" AS pe
    JOIN "game_data"."external_systems" AS es ON es."id" = pe."external_system_id"
    WHERE pe."player_id" = pa."player_id" AND es."name" = 'tloeg.bbleague.se'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "game_data"."players_external_ids" AS pe
    JOIN "game_data"."external_systems" AS es ON es."id" = pe."external_system_id"
    WHERE pe."player_id" = pa."player_id" AND es."name" = 'tourplay.net'
  );
