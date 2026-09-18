ALTER TABLE "game_data"."players" ADD COLUMN "move_increase_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "strength_increase_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "agility_increase_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "passing_increase_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "armour_increase_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "move_increase_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "strength_increase_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "agility_increase_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "passing_increase_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "armour_increase_count" integer;