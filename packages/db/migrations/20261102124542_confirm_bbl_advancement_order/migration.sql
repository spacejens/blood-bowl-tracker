-- BBL's Skills cell lists a player's advancements in the order they were
-- taken, so a numbered paid advancement of a player BBL alone describes (a
-- BBL external id and no TP one) is confirmed. Starting skills, free extras,
-- removed rows and rows with no number are left alone. The history triggers
-- record each change.
--
-- BBL numbers every advancement it lists, including one stored as a free
-- extra (such as a trophy-granted mutation), which is not one of the paid
-- advancements. Each confirmed row therefore moves down one for every free
-- extra of the player numbered before it, so skills and increases keep one
-- paid numbering from 1. A player with a free extra that has no number
-- cannot be renumbered, so that player's rows stay unconfirmed. Only rows
-- not yet confirmed are touched, so running this again changes nothing.
UPDATE "game_data"."player_advancements" AS pa
SET "order_confirmed" = true,
  "advancement_order" = pa."advancement_order" - (
    SELECT count(*)
    FROM "game_data"."player_advancements" AS fe
    WHERE fe."player_id" = pa."player_id"
      AND fe."is_free_extra" = true
      AND fe."removed" = false
      AND fe."source" <> 'starting'
      AND fe."advancement_order" < pa."advancement_order"
  )
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
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "game_data"."player_advancements" AS fe
    WHERE fe."player_id" = pa."player_id"
      AND fe."is_free_extra" = true
      AND fe."removed" = false
      AND fe."source" <> 'starting'
      AND fe."advancement_order" IS NULL
  );
