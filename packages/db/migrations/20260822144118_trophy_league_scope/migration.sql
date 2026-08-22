ALTER TABLE "game_data"."trophies" ADD COLUMN "league_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "league_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ALTER COLUMN "competition_group_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ALTER COLUMN "competition_group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ALTER COLUMN "competition_group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD CONSTRAINT "trophies_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "game_data"."leagues"("id");--> statement-breakpoint
ALTER TABLE "game_data"."trophies" ADD CONSTRAINT "trophies_group_or_league" CHECK (("competition_group_id" IS NOT NULL) != ("league_id" IS NOT NULL));