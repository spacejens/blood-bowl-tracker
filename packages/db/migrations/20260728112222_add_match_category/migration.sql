CREATE TYPE "game_data"."match_category" AS ENUM('normal', 'cup_final', 'season_semi_final', 'season_final', 'season_bronze', 'season_qualifier');--> statement-breakpoint
ALTER TABLE "game_data"."matches" DISABLE TRIGGER matches_versioning;--> statement-breakpoint
ALTER TABLE "game_data"."matches" ADD COLUMN "category" "game_data"."match_category" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."matches_history" ADD COLUMN "category" "game_data"."match_category" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."matches" ENABLE TRIGGER matches_versioning;