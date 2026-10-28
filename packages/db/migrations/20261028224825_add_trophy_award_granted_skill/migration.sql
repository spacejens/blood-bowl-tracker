ALTER TABLE "game_data"."trophy_awards" ADD COLUMN "granted_skill_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_awards_history" ADD COLUMN "granted_skill_id" integer;--> statement-breakpoint
ALTER TABLE "game_data"."trophy_awards" ADD CONSTRAINT "trophy_awards_granted_skill_id_skills_id_fkey" FOREIGN KEY ("granted_skill_id") REFERENCES "game_data"."skills"("id");