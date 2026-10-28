ALTER TYPE "game_data"."advancement_kind" ADD VALUE 'granted_skill';--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs" DROP CONSTRAINT "advancement_costs_rules_set_number_kind_unique";--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs" ADD COLUMN "league_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs" ADD COLUMN "skill_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs_history" ADD COLUMN "league_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs_history" ADD COLUMN "skill_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs" ADD CONSTRAINT "advancement_costs_rules_set_league_number_kind_unique" UNIQUE NULLS NOT DISTINCT("rules_set_id","league_id","advancement_number","advancement_kind");--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs" ADD CONSTRAINT "advancement_costs_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "game_data"."leagues"("id");--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs" ADD CONSTRAINT "advancement_costs_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "game_data"."skills"("id");--> statement-breakpoint
ALTER TABLE "game_data"."advancement_costs" ADD CONSTRAINT "advancement_costs_skill_matches_kind" CHECK (("skill_id" is not null) = ("advancement_kind"::text = 'granted_skill'));