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
-- numbering. Only one Loner row per journeyman is converted: his
-- lowest-id gained Loner, and only while he has no starting Loner already.
-- Each unconfirmed row of his numbered after that Loner moves down one (the
-- proxy numbering TP's list order gave). A confirmed paid row is not moved:
-- a gained Loner was stored as a free extra, whose confirmed slot was
-- already closed.
UPDATE "game_data"."player_advancements" AS pa
SET "advancement_order" = pa."advancement_order" - (
    SELECT count(*)
    FROM "game_data"."player_advancements" AS l
    WHERE l."id" = (
        SELECT min(m."id")
        FROM "game_data"."player_advancements" AS m
        JOIN "game_data"."skills" AS ms ON ms."id" = m."skill_id"
        WHERE m."player_id" = pa."player_id"
          AND ms."name" = 'Loner'
          AND m."source" <> 'starting'
          AND m."removed" = false
      )
      AND l."order_confirmed" = false
      AND l."advancement_order" < pa."advancement_order"
      AND NOT EXISTS (
        SELECT 1
        FROM "game_data"."player_advancements" AS st
        JOIN "game_data"."skills" AS sts ON sts."id" = st."skill_id"
        WHERE st."player_id" = pa."player_id"
          AND sts."name" = 'Loner'
          AND st."source" = 'starting'
          AND st."removed" = false
      )
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
-- That gained Loner becomes the journeyman's starting Loner, keeping its
-- roll as the variant. The history triggers record the change. The row's
-- unique key (player, skill, variant) does not change, so no index can
-- collide.
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
  AND pa."removed" = false
  AND pa."id" = (
    SELECT min(m."id")
    FROM "game_data"."player_advancements" AS m
    WHERE m."player_id" = pa."player_id"
      AND m."skill_id" = pa."skill_id"
      AND m."source" <> 'starting'
      AND m."removed" = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM "game_data"."player_advancements" AS st
    WHERE st."player_id" = pa."player_id"
      AND st."skill_id" = pa."skill_id"
      AND st."source" = 'starting'
      AND st."removed" = false
  );
--> statement-breakpoint
-- A journeyman with no Loner recorded at all (one TP shows only in match
-- line-ups, which name no skills) gets a starting Loner with no variant.
-- It is skipped where any row, removed or not, already holds the
-- (player, Loner, no variant) key, which a unique index would reject.
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
      AND ((pa."source" = 'starting' AND pa."removed" = false)
        OR pa."attribute_value" IS NULL)
  );
