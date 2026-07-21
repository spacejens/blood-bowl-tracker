ALTER TYPE "game_data"."action_type" ADD VALUE 'weather_roll';--> statement-breakpoint
ALTER TYPE "game_data"."action_type" ADD VALUE 'inducements_roll';--> statement-breakpoint
ALTER TYPE "game_data"."action_type" ADD VALUE 'winnings_roll';--> statement-breakpoint
ALTER TYPE "game_data"."action_type" ADD VALUE 'fan_factor_roll';--> statement-breakpoint
ALTER TYPE "game_data"."action_type" ADD VALUE 'journeyman_signing';--> statement-breakpoint
ALTER TYPE "game_data"."action_type" ADD VALUE 'prayers_to_nuffle';--> statement-breakpoint
ALTER TYPE "game_data"."action_type" ADD VALUE 'dedicated_fans_roll';--> statement-breakpoint
ALTER TYPE "game_data"."action_type" ADD VALUE 'secret_objective';--> statement-breakpoint
ALTER TYPE "game_data"."consequence_type" ADD VALUE 'expensive_mistake';--> statement-breakpoint
ALTER TYPE "game_data"."consequence_type" ADD VALUE 'concession';--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "weather_type" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "inducements_cost" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "winnings" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "fan_factor" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "journeymen_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "prayers_to_nuffle" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "dedicated_fans" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "secret_objective" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ADD COLUMN "expensive_mistake" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "weather_type" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "inducements_cost" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "winnings" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "fan_factor" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "journeymen_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "prayers_to_nuffle" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "dedicated_fans" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "secret_objective" integer;--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ADD COLUMN "expensive_mistake" integer;