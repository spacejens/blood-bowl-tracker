ALTER TABLE "game_data"."players" ADD COLUMN "miss_next_game" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "niggling_injury_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "move_reduction_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "strength_reduction_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "agility_reduction_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "passing_reduction_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "armour_reduction_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "miss_next_game" boolean;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "niggling_injury_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "move_reduction_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "strength_reduction_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "agility_reduction_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "passing_reduction_count" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "armour_reduction_count" integer;