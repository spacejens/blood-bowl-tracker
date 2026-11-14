-- A journeyman is a temporary player named "Journeyman" in a basic position
-- of the team's race (any position that is not a star player's). Mark every
-- such player that already has a Loner row that is not removed, of any
-- source, trimming the name and ignoring its case. A Journeyman-named player
-- with no Loner row is left unmarked: he may be a recruit, and a later
-- import that sees his Loner marks him. Every skill named Loner counts.
UPDATE "game_data"."players" AS p
SET "is_journeyman" = true
FROM "game_data"."positions" AS pos
WHERE pos."id" = p."position_id"
  AND pos."is_star_player" = false
  AND lower(btrim(p."name")) = 'journeyman'
  AND p."is_journeyman" = false
  AND EXISTS (
    SELECT 1
    FROM "game_data"."player_advancements" AS a
    WHERE a."player_id" = p."id"
      AND a."removed" = false
      AND a."skill_id" IN (
        SELECT "id" FROM "game_data"."skills" WHERE "name" = 'Loner'
      )
  );
--> statement-breakpoint
-- A journeyman's Loner becomes a starting skill below, so it leaves the
-- numbering. Only one Loner row per journeyman is converted: his
-- lowest-id gained Loner, and only while he has no starting Loner already.
-- Each unconfirmed row of his numbered after that Loner moves down one (the
-- proxy numbering TP's list order gave). A confirmed paid row is not moved:
-- a gained Loner was stored as a free extra, whose confirmed slot was
-- already closed. Likewise no shift happens when the converted Loner is
-- itself confirmed (the count only includes unconfirmed Loners): its slot is
-- pinned, so the rows after it keep their numbers. The converted row is
-- excluded from the shift; any other Loner row shifts like any other.
UPDATE "game_data"."player_advancements" AS pa
SET "advancement_order" = pa."advancement_order" - (
    SELECT count(*)
    FROM "game_data"."player_advancements" AS l
    WHERE l."id" = (
        SELECT min(m."id")
        FROM "game_data"."player_advancements" AS m
        WHERE m."player_id" = pa."player_id"
          AND m."skill_id" IN (
            SELECT "id" FROM "game_data"."skills" WHERE "name" = 'Loner'
          )
          AND m."source" <> 'starting'
          AND m."removed" = false
      )
      AND l."order_confirmed" = false
      AND l."advancement_order" < pa."advancement_order"
      AND NOT EXISTS (
        SELECT 1
        FROM "game_data"."player_advancements" AS st
        WHERE st."player_id" = pa."player_id"
          AND st."skill_id" IN (
            SELECT "id" FROM "game_data"."skills" WHERE "name" = 'Loner'
          )
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
  AND pa."id" <> (
    SELECT min(m."id")
    FROM "game_data"."player_advancements" AS m
    WHERE m."player_id" = pa."player_id"
      AND m."skill_id" IN (
        SELECT "id" FROM "game_data"."skills" WHERE "name" = 'Loner'
      )
      AND m."source" <> 'starting'
      AND m."removed" = false
  );
--> statement-breakpoint
-- That gained Loner (deliberately the lowest id over every skill named
-- Loner, so the choice is stable and the same one statement 2 counted)
-- becomes the journeyman's starting Loner, keeping its roll as the variant.
-- The history triggers record the change. The row's unique key (player,
-- skill, variant) does not change, so no index can collide. A marked
-- journeyman always has a Loner row, so no starting Loner is invented here.
UPDATE "game_data"."player_advancements" AS pa
SET "source" = 'starting',
  "advancement_order" = NULL,
  "order_confirmed" = false,
  "is_free_extra" = false
FROM "game_data"."players" AS p
WHERE p."id" = pa."player_id"
  AND p."is_journeyman" = true
  AND pa."source" <> 'starting'
  AND pa."removed" = false
  AND pa."id" = (
    SELECT min(m."id")
    FROM "game_data"."player_advancements" AS m
    WHERE m."player_id" = pa."player_id"
      AND m."skill_id" IN (
        SELECT "id" FROM "game_data"."skills" WHERE "name" = 'Loner'
      )
      AND m."source" <> 'starting'
      AND m."removed" = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM "game_data"."player_advancements" AS st
    WHERE st."player_id" = pa."player_id"
      AND st."skill_id" IN (
        SELECT "id" FROM "game_data"."skills" WHERE "name" = 'Loner'
      )
      AND st."source" = 'starting'
      AND st."removed" = false
  );
