ALTER TABLE "game_data"."trophies" ADD COLUMN "grants_skill" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."trophies_history" ADD COLUMN "grants_skill" boolean;