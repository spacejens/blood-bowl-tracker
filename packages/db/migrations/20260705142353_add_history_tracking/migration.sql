CREATE TABLE "game_data"."coach_external_ids_history" (
	"id" integer,
	"coach_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "coach_external_ids_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."coaches_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "coaches_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."competition_teams_history" (
	"id" integer,
	"competition_id" integer NOT NULL,
	"team_era_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "competition_teams_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."competitions_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"type" "game_data"."competition_type" NOT NULL,
	"era_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "competitions_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."eras_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"league_id" integer NOT NULL,
	"rules_set_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "eras_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."external_systems_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "external_systems_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."leagues_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "leagues_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."match_events_history" (
	"id" integer,
	"match_id" integer NOT NULL,
	"acting_team_era_id" integer,
	"consequence_team_era_id" integer,
	"acting_player_id" integer,
	"consequence_player_id" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "match_events_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."match_teams_history" (
	"id" integer,
	"match_id" integer NOT NULL,
	"team_era_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "match_teams_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."matches_history" (
	"id" integer,
	"competition_id" integer NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "matches_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."players_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"team_era_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "players_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."positions_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"race_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "positions_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."race_rules_sets_history" (
	"id" integer,
	"race_id" integer NOT NULL,
	"rules_set_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "race_rules_sets_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."races_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "races_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."rules_sets_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "rules_sets_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."team_eras_history" (
	"id" integer,
	"team_id" integer NOT NULL,
	"era_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "team_eras_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."teams_history" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"race_id" integer NOT NULL,
	"coach_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "teams_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
ALTER TABLE "game_data"."coach_external_ids" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."coach_external_ids" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."coach_external_ids" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."coaches" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."coaches" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."coaches" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD COLUMN "id" serial;--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competitions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competitions" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competitions" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."eras" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."eras" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."eras" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."external_systems" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."external_systems" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."external_systems" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."leagues" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."leagues" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."leagues" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD COLUMN "id" serial;--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."matches" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."matches" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."matches" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets" ADD COLUMN "id" serial;--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."races" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."races" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."races" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."team_eras" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."team_eras" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."team_eras" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."teams" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."teams" ADD COLUMN "history_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."teams" ADD COLUMN "history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" DROP CONSTRAINT "competition_teams_pkey";--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" DROP CONSTRAINT "match_teams_pkey";--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets" DROP CONSTRAINT "race_rules_sets_pkey";--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams" ADD CONSTRAINT "competition_teams_competition_id_team_era_id_unique" UNIQUE("competition_id","team_era_id");--> statement-breakpoint
ALTER TABLE "game_data"."match_teams" ADD CONSTRAINT "match_teams_match_id_team_era_id_unique" UNIQUE("match_id","team_era_id");--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets" ADD CONSTRAINT "race_rules_sets_race_id_rules_set_id_unique" UNIQUE("race_id","rules_set_id");--> statement-breakpoint
ALTER TABLE "game_data"."coach_external_ids_history" ADD CONSTRAINT "coach_external_ids_history_id_coach_external_ids_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."coach_external_ids"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."coaches_history" ADD CONSTRAINT "coaches_history_id_coaches_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."coaches"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."competition_teams_history" ADD CONSTRAINT "competition_teams_history_id_competition_teams_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."competition_teams"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."competitions_history" ADD CONSTRAINT "competitions_history_id_competitions_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."competitions"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."eras_history" ADD CONSTRAINT "eras_history_id_eras_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."eras"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."external_systems_history" ADD CONSTRAINT "external_systems_history_id_external_systems_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."external_systems"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."leagues_history" ADD CONSTRAINT "leagues_history_id_leagues_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."leagues"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD CONSTRAINT "match_events_history_id_match_events_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."match_events"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."match_teams_history" ADD CONSTRAINT "match_teams_history_id_match_teams_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."match_teams"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."matches_history" ADD CONSTRAINT "matches_history_id_matches_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."matches"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD CONSTRAINT "players_history_id_players_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."players"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."positions_history" ADD CONSTRAINT "positions_history_id_positions_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."positions"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."race_rules_sets_history" ADD CONSTRAINT "race_rules_sets_history_id_race_rules_sets_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."race_rules_sets"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."races_history" ADD CONSTRAINT "races_history_id_races_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."races"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_history" ADD CONSTRAINT "rules_sets_history_id_rules_sets_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."rules_sets"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."team_eras_history" ADD CONSTRAINT "team_eras_history_id_team_eras_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."team_eras"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "game_data"."teams_history" ADD CONSTRAINT "teams_history_id_teams_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."teams"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS coach_external_ids_versioning ON "game_data"."coach_external_ids";
--> statement-breakpoint
CREATE TRIGGER coach_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."coach_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.coach_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS coach_external_ids_set_updated_at ON "game_data"."coach_external_ids";
--> statement-breakpoint
CREATE TRIGGER coach_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."coach_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS coaches_versioning ON "game_data"."coaches";
--> statement-breakpoint
CREATE TRIGGER coaches_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."coaches"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.coaches_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS coaches_set_updated_at ON "game_data"."coaches";
--> statement-breakpoint
CREATE TRIGGER coaches_set_updated_at
  BEFORE UPDATE ON "game_data"."coaches"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_teams_versioning ON "game_data"."competition_teams";
--> statement-breakpoint
CREATE TRIGGER competition_teams_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."competition_teams"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.competition_teams_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_teams_set_updated_at ON "game_data"."competition_teams";
--> statement-breakpoint
CREATE TRIGGER competition_teams_set_updated_at
  BEFORE UPDATE ON "game_data"."competition_teams"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS competitions_versioning ON "game_data"."competitions";
--> statement-breakpoint
CREATE TRIGGER competitions_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."competitions"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.competitions_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS competitions_set_updated_at ON "game_data"."competitions";
--> statement-breakpoint
CREATE TRIGGER competitions_set_updated_at
  BEFORE UPDATE ON "game_data"."competitions"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS eras_versioning ON "game_data"."eras";
--> statement-breakpoint
CREATE TRIGGER eras_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."eras"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.eras_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS eras_set_updated_at ON "game_data"."eras";
--> statement-breakpoint
CREATE TRIGGER eras_set_updated_at
  BEFORE UPDATE ON "game_data"."eras"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_systems_versioning ON "game_data"."external_systems";
--> statement-breakpoint
CREATE TRIGGER external_systems_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."external_systems"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.external_systems_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_systems_set_updated_at ON "game_data"."external_systems";
--> statement-breakpoint
CREATE TRIGGER external_systems_set_updated_at
  BEFORE UPDATE ON "game_data"."external_systems"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS leagues_versioning ON "game_data"."leagues";
--> statement-breakpoint
CREATE TRIGGER leagues_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."leagues"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.leagues_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS leagues_set_updated_at ON "game_data"."leagues";
--> statement-breakpoint
CREATE TRIGGER leagues_set_updated_at
  BEFORE UPDATE ON "game_data"."leagues"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_events_versioning ON "game_data"."match_events";
--> statement-breakpoint
CREATE TRIGGER match_events_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."match_events"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.match_events_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_events_set_updated_at ON "game_data"."match_events";
--> statement-breakpoint
CREATE TRIGGER match_events_set_updated_at
  BEFORE UPDATE ON "game_data"."match_events"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_teams_versioning ON "game_data"."match_teams";
--> statement-breakpoint
CREATE TRIGGER match_teams_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."match_teams"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.match_teams_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_teams_set_updated_at ON "game_data"."match_teams";
--> statement-breakpoint
CREATE TRIGGER match_teams_set_updated_at
  BEFORE UPDATE ON "game_data"."match_teams"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS matches_versioning ON "game_data"."matches";
--> statement-breakpoint
CREATE TRIGGER matches_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."matches"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.matches_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS matches_set_updated_at ON "game_data"."matches";
--> statement-breakpoint
CREATE TRIGGER matches_set_updated_at
  BEFORE UPDATE ON "game_data"."matches"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS players_versioning ON "game_data"."players";
--> statement-breakpoint
CREATE TRIGGER players_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."players"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.players_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS players_set_updated_at ON "game_data"."players";
--> statement-breakpoint
CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON "game_data"."players"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS positions_versioning ON "game_data"."positions";
--> statement-breakpoint
CREATE TRIGGER positions_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."positions"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.positions_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS positions_set_updated_at ON "game_data"."positions";
--> statement-breakpoint
CREATE TRIGGER positions_set_updated_at
  BEFORE UPDATE ON "game_data"."positions"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS race_rules_sets_versioning ON "game_data"."race_rules_sets";
--> statement-breakpoint
CREATE TRIGGER race_rules_sets_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."race_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.race_rules_sets_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS race_rules_sets_set_updated_at ON "game_data"."race_rules_sets";
--> statement-breakpoint
CREATE TRIGGER race_rules_sets_set_updated_at
  BEFORE UPDATE ON "game_data"."race_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS races_versioning ON "game_data"."races";
--> statement-breakpoint
CREATE TRIGGER races_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."races"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.races_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS races_set_updated_at ON "game_data"."races";
--> statement-breakpoint
CREATE TRIGGER races_set_updated_at
  BEFORE UPDATE ON "game_data"."races"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS rules_sets_versioning ON "game_data"."rules_sets";
--> statement-breakpoint
CREATE TRIGGER rules_sets_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.rules_sets_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS rules_sets_set_updated_at ON "game_data"."rules_sets";
--> statement-breakpoint
CREATE TRIGGER rules_sets_set_updated_at
  BEFORE UPDATE ON "game_data"."rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS team_eras_versioning ON "game_data"."team_eras";
--> statement-breakpoint
CREATE TRIGGER team_eras_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."team_eras"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.team_eras_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS team_eras_set_updated_at ON "game_data"."team_eras";
--> statement-breakpoint
CREATE TRIGGER team_eras_set_updated_at
  BEFORE UPDATE ON "game_data"."team_eras"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS teams_versioning ON "game_data"."teams";
--> statement-breakpoint
CREATE TRIGGER teams_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."teams"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.teams_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS teams_set_updated_at ON "game_data"."teams";
--> statement-breakpoint
CREATE TRIGGER teams_set_updated_at
  BEFORE UPDATE ON "game_data"."teams"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
