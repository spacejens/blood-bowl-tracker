ALTER TABLE "game_data"."competitions" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "game_data"."competitions" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "game_data"."competitions_history" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "game_data"."competitions_history" ADD COLUMN "end_date" date;