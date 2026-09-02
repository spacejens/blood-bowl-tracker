ALTER TABLE "game_data"."players" ADD COLUMN "move" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "strength" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "agility" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "passing" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "game_data"."players" ADD COLUMN "armour" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "move" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "strength" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "agility" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "passing" integer;--> statement-breakpoint
ALTER TABLE "game_data"."players_history" ADD COLUMN "armour" integer DEFAULT 0 NOT NULL;