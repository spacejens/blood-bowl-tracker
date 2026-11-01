ALTER TABLE "game_data"."player_skills" ADD COLUMN "is_free_extra" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."player_skills_history" ADD COLUMN "is_free_extra" boolean;
--> statement-breakpoint
-- Every gained Hatred is a free extra: BB2025 grants Hatred only on top of a
-- player's advancements. A player can hate several keywords, one row each,
-- and every one of those rows is free. The history triggers record the change.
UPDATE "game_data"."player_skills" AS ps
SET "is_free_extra" = true
FROM "game_data"."skills" AS s
WHERE s."id" = ps."skill_id"
  AND s."name" = 'Hatred'
  AND ps."source" <> 'starting';
--> statement-breakpoint
-- A skill one of the player's own trophy awards grants (Gudarnas Förkämpe's
-- mutation) is a free extra. Hatred is never marked by this rule.
UPDATE "game_data"."player_skills" AS ps
SET "is_free_extra" = true
WHERE ps."is_free_extra" = false
  AND EXISTS (
    SELECT 1 FROM "game_data"."trophy_awards" AS ta
    WHERE ta."player_id" = ps."player_id"
      AND ta."granted_skill_id" = ps."skill_id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "game_data"."skills" AS s
    WHERE s."id" = ps."skill_id" AND s."name" = 'Hatred'
  );