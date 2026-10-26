CREATE TYPE "game_data"."player_status" AS ENUM('active', 'dead', 'retired', 'temporarily_retired');--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "status" "game_data"."player_status";--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "status" "game_data"."player_status";