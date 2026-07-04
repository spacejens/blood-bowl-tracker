CREATE TABLE "game_data"."team_eras" (
	"id" serial PRIMARY KEY,
	"team_id" integer NOT NULL,
	"era_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_eras_team_id_era_id_unique" UNIQUE("team_id","era_id")
);
--> statement-breakpoint
ALTER TABLE "game_data"."team_eras" ADD CONSTRAINT "team_eras_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "game_data"."teams"("id");--> statement-breakpoint
ALTER TABLE "game_data"."team_eras" ADD CONSTRAINT "team_eras_era_id_eras_id_fkey" FOREIGN KEY ("era_id") REFERENCES "game_data"."eras"("id");