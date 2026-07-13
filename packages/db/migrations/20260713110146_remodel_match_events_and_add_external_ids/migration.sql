CREATE TYPE "game_data"."action_type" AS ENUM('touchdown', 'completion', 'interception', 'deflection', 'foul', 'mvp_award', 'casualty', 'badly_hurt', 'serious_injury', 'death');--> statement-breakpoint
CREATE TYPE "game_data"."consequence_type" AS ENUM('casualty', 'badly_hurt', 'serious_injury', 'miss_next_game', 'niggling_injury', 'stat_reduction_ma', 'stat_reduction_st', 'stat_reduction_ag', 'stat_reduction_av', 'death', 'sent_off');--> statement-breakpoint
CREATE TABLE "game_data"."match_events_external_ids" (
	"id" serial PRIMARY KEY,
	"match_event_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "match_events_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."match_events_external_ids_history" (LIKE "game_data"."match_events_external_ids");
--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP CONSTRAINT "match_events_acting_team_era_id_team_eras_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP CONSTRAINT "match_events_consequence_team_era_id_team_eras_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "acting_match_team_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "consequence_match_team_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "action_type" "game_data"."action_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "consequence_type" "game_data"."consequence_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "acting_match_team_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "consequence_match_team_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "action_type" "game_data"."action_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "consequence_type" "game_data"."consequence_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP COLUMN "acting_team_era_id";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP COLUMN "consequence_team_era_id";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "acting_team_era_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "consequence_team_era_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD CONSTRAINT "match_events_acting_match_team_id_match_teams_id_fkey" FOREIGN KEY ("acting_match_team_id") REFERENCES "game_data"."match_teams"("id");--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD CONSTRAINT "match_events_consequence_match_team_id_match_teams_id_fkey" FOREIGN KEY ("consequence_match_team_id") REFERENCES "game_data"."match_teams"("id");--> statement-breakpoint
ALTER TABLE "game_data"."match_events_external_ids" ADD CONSTRAINT "match_events_external_ids_match_event_id_match_events_id_fkey" FOREIGN KEY ("match_event_id") REFERENCES "game_data"."match_events"("id");--> statement-breakpoint
ALTER TABLE "game_data"."match_events_external_ids" ADD CONSTRAINT "match_events_external_ids_FcIC5COqSlxR_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD CONSTRAINT "match_events_action_or_consequence" CHECK ("action_type" IS NOT NULL OR "consequence_type" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "game_data"."match_events_external_ids_history" ADD CONSTRAINT "match_events_external_ids_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."match_events_external_ids_history" ADD CONSTRAINT "match_events_external_ids_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."match_events_external_ids"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_events_external_ids_versioning ON "game_data"."match_events_external_ids";
--> statement-breakpoint
CREATE TRIGGER match_events_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."match_events_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.match_events_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_events_external_ids_set_updated_at ON "game_data"."match_events_external_ids";
--> statement-breakpoint
CREATE TRIGGER match_events_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."match_events_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
