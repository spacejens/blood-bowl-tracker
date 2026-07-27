CREATE TYPE "game_data"."consequence_avoided_by" AS ENUM('apothecary', 'regeneration');--> statement-breakpoint
CREATE TYPE "game_data"."unidentified_participant_kind" AS ENUM('journeyman', 'mercenary', 'mercenary_or_star', 'fans_or_random_event', 'mercenary_or_fans_or_random_event');--> statement-breakpoint
ALTER TYPE "game_data"."consequence_type" ADD VALUE 'casualty_avoided';--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "acting_unidentified_kind" "game_data"."unidentified_participant_kind";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "consequence_unidentified_kind" "game_data"."unidentified_participant_kind";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "consequence_avoided_by" "game_data"."consequence_avoided_by";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "consequence_avoided_severity" "game_data"."consequence_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "acting_unidentified_kind" "game_data"."unidentified_participant_kind";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "consequence_unidentified_kind" "game_data"."unidentified_participant_kind";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "consequence_avoided_by" "game_data"."consequence_avoided_by";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "consequence_avoided_severity" "game_data"."consequence_type";