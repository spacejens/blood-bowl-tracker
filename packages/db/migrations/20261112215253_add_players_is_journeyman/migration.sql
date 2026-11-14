ALTER TABLE "game_data"."player_advancements" DROP CONSTRAINT "player_advancements_only_characteristic_removed";--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "is_journeyman" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "is_journeyman" boolean;--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD CONSTRAINT "player_advancements_removed_kinds" CHECK ("removed" = false OR "source" = 'characteristic' OR "source" = 'starting');