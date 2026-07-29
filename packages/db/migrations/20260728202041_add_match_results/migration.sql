ALTER TABLE "game_data"."match_teams" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_teams_history" ADD COLUMN "score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."matches" ADD COLUMN "winning_match_team_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."matches_history" ADD COLUMN "winning_match_team_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."matches" ADD CONSTRAINT "matches_winning_match_team_id_match_teams_id_fkey" FOREIGN KEY ("winning_match_team_id") REFERENCES "game_data"."match_teams"("id");