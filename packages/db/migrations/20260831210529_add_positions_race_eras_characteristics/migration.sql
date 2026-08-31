ALTER TABLE "game_data"."positions_race_eras" ADD COLUMN "move" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras" ADD COLUMN "strength" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras" ADD COLUMN "agility" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras" ADD COLUMN "passing" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras" ADD COLUMN "armour" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "move" integer;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "strength" integer;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "agility" integer;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "passing" integer;--> statement-breakpoint
ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "armour" integer;