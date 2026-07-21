CREATE TYPE "game_data"."event_type" AS ENUM('weather');--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "event_type" "game_data"."event_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "inducements_from_treasury" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "event_type" "game_data"."event_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "inducements_from_treasury" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DISABLE TRIGGER match_events_versioning;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DROP CONSTRAINT "match_events_action_or_consequence";--> statement-breakpoint
UPDATE "game_data"."match_events" SET "event_type" = 'weather' WHERE "action_type" = 'weather_roll';--> statement-breakpoint
UPDATE "game_data"."match_events_history" SET "event_type" = 'weather' WHERE "action_type" = 'weather_roll';--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ALTER COLUMN "action_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ALTER COLUMN "consequence_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "action_type" SET DATA TYPE text;--> statement-breakpoint
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "consequence_type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "game_data"."match_events" SET "consequence_type" = 'dedicated_fans' WHERE "action_type" = 'dedicated_fans_roll';--> statement-breakpoint
UPDATE "game_data"."match_events_history" SET "consequence_type" = 'dedicated_fans' WHERE "action_type" = 'dedicated_fans_roll';--> statement-breakpoint
DROP TYPE "game_data"."action_type";--> statement-breakpoint
DROP TYPE "game_data"."consequence_type";--> statement-breakpoint
CREATE TYPE "game_data"."action_type" AS ENUM('touchdown', 'completion', 'interception', 'deflection', 'foul', 'mvp_award', 'casualty', 'badly_hurt', 'serious_injury', 'death', 'inducements', 'winnings', 'fan_factor', 'journeymen_signings', 'prayers_to_nuffle', 'secret_objective');--> statement-breakpoint
CREATE TYPE "game_data"."consequence_type" AS ENUM('casualty', 'badly_hurt', 'serious_injury', 'miss_next_game', 'niggling_injury', 'stat_reduction_ma', 'stat_reduction_st', 'stat_reduction_ag', 'stat_reduction_av', 'stat_reduction_pa', 'death', 'sent_off', 'expensive_mistake', 'concession', 'dedicated_fans');--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ALTER COLUMN "action_type" SET DATA TYPE "game_data"."action_type" USING (
  CASE "action_type"
    WHEN 'weather_roll' THEN NULL
    WHEN 'inducements_roll' THEN 'inducements'
    WHEN 'winnings_roll' THEN 'winnings'
    WHEN 'fan_factor_roll' THEN 'fan_factor'
    WHEN 'journeyman_signing' THEN 'journeymen_signings'
    WHEN 'dedicated_fans_roll' THEN NULL
    ELSE "action_type"
  END
)::"game_data"."action_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ALTER COLUMN "consequence_type" SET DATA TYPE "game_data"."consequence_type" USING "consequence_type"::"game_data"."consequence_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "action_type" SET DATA TYPE "game_data"."action_type" USING (
  CASE "action_type"
    WHEN 'weather_roll' THEN NULL
    WHEN 'inducements_roll' THEN 'inducements'
    WHEN 'winnings_roll' THEN 'winnings'
    WHEN 'fan_factor_roll' THEN 'fan_factor'
    WHEN 'journeyman_signing' THEN 'journeymen_signings'
    WHEN 'dedicated_fans_roll' THEN NULL
    ELSE "action_type"
  END
)::"game_data"."action_type";--> statement-breakpoint
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "consequence_type" SET DATA TYPE "game_data"."consequence_type" USING "consequence_type"::"game_data"."consequence_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD CONSTRAINT "match_events_action_or_consequence" CHECK (("event_type" IS NOT NULL AND "action_type" IS NULL AND "consequence_type" IS NULL) OR ("event_type" IS NULL AND ("action_type" IS NOT NULL OR "consequence_type" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ENABLE TRIGGER match_events_versioning;
