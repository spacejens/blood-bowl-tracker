-- A journeyman is a temporary player named "Journeyman" in a basic position
-- of the team's race (any position that is not a star player's). Mark every
-- such player, trimming the name and ignoring its case.
UPDATE "game_data"."players" AS p
SET "is_journeyman" = true
FROM "game_data"."positions" AS pos
WHERE pos."id" = p."position_id"
  AND pos."is_star_player" = false
  AND lower(btrim(p."name")) = 'journeyman'
  AND p."is_journeyman" = false;
--> statement-breakpoint
-- A journeyman's Loner becomes a starting skill below, so it leaves the
-- numbering. Each unconfirmed row of his numbered after an unconfirmed
-- gained Loner moves down one per such Loner (the proxy numbering TP's list
-- order gave). A confirmed paid row is not moved: a gained Loner was stored
-- as a free extra, whose confirmed slot was already closed.
UPDATE "game_data"."player_advancements" AS pa
SET "advancement_order" = pa."advancement_order" - (
    SELECT count(*)
    FROM "game_data"."player_advancements" AS l
    JOIN "game_data"."skills" AS s ON s."id" = l."skill_id"
    WHERE l."player_id" = pa."player_id"
      AND s."name" = 'Loner'
      AND l."source" <> 'starting'
      AND l."removed" = false
      AND l."order_confirmed" = false
      AND l."advancement_order" < pa."advancement_order"
  )
FROM "game_data"."players" AS p
WHERE p."id" = pa."player_id"
  AND p."is_journeyman" = true
  AND pa."order_confirmed" = false
  AND pa."removed" = false
  AND pa."source" <> 'starting'
  AND pa."advancement_order" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "game_data"."skills" AS own
    WHERE own."id" = pa."skill_id" AND own."name" = 'Loner'
  );
--> statement-breakpoint
-- Each journeyman's gained Loner becomes his starting Loner, keeping its
-- roll as the variant. The history triggers record the change.
UPDATE "game_data"."player_advancements" AS pa
SET "source" = 'starting',
  "advancement_order" = NULL,
  "order_confirmed" = false,
  "is_free_extra" = false
FROM "game_data"."players" AS p, "game_data"."skills" AS s
WHERE p."id" = pa."player_id"
  AND s."id" = pa."skill_id"
  AND p."is_journeyman" = true
  AND s."name" = 'Loner'
  AND pa."source" <> 'starting'
  AND pa."removed" = false;
--> statement-breakpoint
-- A journeyman with no Loner recorded at all (one TP shows only in match
-- line-ups, which name no skills) gets a starting Loner with no variant.
INSERT INTO "game_data"."player_advancements" ("player_id", "skill_id", "source")
SELECT p."id", s."id", 'starting'
FROM "game_data"."players" AS p
CROSS JOIN "game_data"."skills" AS s
WHERE p."is_journeyman" = true
  AND s."name" = 'Loner'
  AND NOT EXISTS (
    SELECT 1 FROM "game_data"."player_advancements" AS pa
    WHERE pa."player_id" = p."id"
      AND pa."skill_id" = s."id"
      AND pa."source" = 'starting'
      AND pa."removed" = false
  );
