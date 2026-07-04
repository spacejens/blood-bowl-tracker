ALTER TABLE "game_data"."competition_teams" DROP CONSTRAINT "competition_teams_team_id_teams_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP CONSTRAINT "match_events_acting_team_id_teams_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP CONSTRAINT "match_events_consequence_team_id_teams_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" DROP CONSTRAINT "match_teams_team_id_teams_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."players" DROP CONSTRAINT "players_team_id_teams_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD COLUMN "team_era_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "acting_team_era_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "consequence_team_era_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD COLUMN "team_era_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "team_era_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP COLUMN "acting_team_id";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP COLUMN "consequence_team_id";--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "game_data"."players" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD PRIMARY KEY ("competition_id","team_era_id");--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD PRIMARY KEY ("match_id","team_era_id");--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD CONSTRAINT "competition_teams_team_era_id_team_eras_id_fkey" FOREIGN KEY ("team_era_id") REFERENCES "game_data"."team_eras"("id");--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD CONSTRAINT "match_events_acting_team_era_id_team_eras_id_fkey" FOREIGN KEY ("acting_team_era_id") REFERENCES "game_data"."team_eras"("id");--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD CONSTRAINT "match_events_consequence_team_era_id_team_eras_id_fkey" FOREIGN KEY ("consequence_team_era_id") REFERENCES "game_data"."team_eras"("id");--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD CONSTRAINT "match_teams_team_era_id_team_eras_id_fkey" FOREIGN KEY ("team_era_id") REFERENCES "game_data"."team_eras"("id");--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD CONSTRAINT "players_team_era_id_team_eras_id_fkey" FOREIGN KEY ("team_era_id") REFERENCES "game_data"."team_eras"("id");