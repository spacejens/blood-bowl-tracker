ALTER TABLE "game_data"."trophy_award_rule_eligible_positions" ADD COLUMN "removed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_eligible_positions_history" ADD COLUMN "removed" boolean;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_excluded_match_event_types" ADD COLUMN "removed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_excluded_match_event_types_history" ADD COLUMN "removed" boolean;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_match_event_types" ADD COLUMN "removed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_match_event_types_history" ADD COLUMN "removed" boolean;