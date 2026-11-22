ALTER TABLE "game_data"."rules_sets" ADD COLUMN "lasting_injuries_never_heal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_history" ADD COLUMN "lasting_injuries_never_heal" boolean;--> statement-breakpoint
UPDATE "game_data"."rules_sets_history" h SET "lasting_injuries_never_heal" = r."lasting_injuries_never_heal" FROM "game_data"."rules_sets" r WHERE h."id" = r."id" AND upper_inf(h."history_period");
