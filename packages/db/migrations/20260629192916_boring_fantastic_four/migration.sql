CREATE TYPE "competition_type" AS ENUM('season', 'cup');--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_teams" (
	"competition_id" integer,
	"team_id" integer,
	CONSTRAINT "competition_teams_pkey" PRIMARY KEY("competition_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"type" "competition_type" NOT NULL,
	"era_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eras" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"league_id" integer NOT NULL,
	"rules_set_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" serial PRIMARY KEY,
	"match_id" integer NOT NULL,
	"type" varchar(100) NOT NULL,
	"acting_team_id" integer,
	"consequence_team_id" integer,
	"acting_player_id" integer,
	"consequence_player_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_teams" (
	"match_id" integer,
	"team_id" integer,
	CONSTRAINT "match_teams_pkey" PRIMARY KEY("match_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY,
	"competition_id" integer NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"team_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"race_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_rules_sets" (
	"race_id" integer,
	"rules_set_id" integer,
	CONSTRAINT "race_rules_sets_pkey" PRIMARY KEY("race_id","rules_set_id")
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules_sets" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"race_id" integer NOT NULL,
	"coach_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition_teams" ADD CONSTRAINT "competition_teams_competition_id_competitions_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id");--> statement-breakpoint
ALTER TABLE "competition_teams" ADD CONSTRAINT "competition_teams_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_era_id_eras_id_fkey" FOREIGN KEY ("era_id") REFERENCES "eras"("id");--> statement-breakpoint
ALTER TABLE "eras" ADD CONSTRAINT "eras_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id");--> statement-breakpoint
ALTER TABLE "eras" ADD CONSTRAINT "eras_rules_set_id_rules_sets_id_fkey" FOREIGN KEY ("rules_set_id") REFERENCES "rules_sets"("id");--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id");--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_acting_team_id_teams_id_fkey" FOREIGN KEY ("acting_team_id") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_consequence_team_id_teams_id_fkey" FOREIGN KEY ("consequence_team_id") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_acting_player_id_players_id_fkey" FOREIGN KEY ("acting_player_id") REFERENCES "players"("id");--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_consequence_player_id_players_id_fkey" FOREIGN KEY ("consequence_player_id") REFERENCES "players"("id");--> statement-breakpoint
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id");--> statement-breakpoint
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_competitions_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_position_id_positions_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id");--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_race_id_races_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id");--> statement-breakpoint
ALTER TABLE "race_rules_sets" ADD CONSTRAINT "race_rules_sets_race_id_races_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id");--> statement-breakpoint
ALTER TABLE "race_rules_sets" ADD CONSTRAINT "race_rules_sets_rules_set_id_rules_sets_id_fkey" FOREIGN KEY ("rules_set_id") REFERENCES "rules_sets"("id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_race_id_races_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_coach_id_coaches_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id");