ALTER TABLE "game_data"."player_skills" RENAME TO "player_advancements";--> statement-breakpoint
ALTER TABLE "game_data"."player_skills_history" RENAME TO "player_advancements_history";--> statement-breakpoint
ALTER TYPE "game_data"."player_skill_source" RENAME TO "player_advancement_source";--> statement-breakpoint
ALTER SEQUENCE "game_data"."player_skills_id_seq" RENAME TO "player_advancements_id_seq";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_pkey" TO "player_advancements_pkey";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_player_id_skill_id_attribute_value_unique" TO "player_advancements_player_id_skill_id_attribute_value_unique";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_player_id_players_id_fkey" TO "player_advancements_player_id_players_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_skill_id_skills_id_fkey" TO "player_advancements_skill_id_skills_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_starting_has_no_order" TO "player_advancements_starting_has_no_order";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_history_pkey" TO "player_advancements_history_pkey";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_history_id_fkey" TO "player_advancements_history_id_fkey";--> statement-breakpoint
-- Postgres names each NOT NULL constraint after its table.
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_id_not_null" TO "player_advancements_id_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_player_id_not_null" TO "player_advancements_player_id_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_skill_id_not_null" TO "player_advancements_skill_id_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_source_not_null" TO "player_advancements_source_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_is_free_extra_not_null" TO "player_advancements_is_free_extra_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_created_at_not_null" TO "player_advancements_created_at_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_updated_at_not_null" TO "player_advancements_updated_at_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_history_version_not_null" TO "player_advancements_history_version_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" RENAME CONSTRAINT "player_skills_history_period_not_null" TO "player_advancements_history_period_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_id_not_null" TO "player_advancements_id_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_player_id_not_null" TO "player_advancements_player_id_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_skill_id_not_null" TO "player_advancements_skill_id_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_source_not_null" TO "player_advancements_source_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_created_at_not_null" TO "player_advancements_created_at_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_updated_at_not_null" TO "player_advancements_updated_at_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_history_version_not_null" TO "player_advancements_history_version_not_null";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" RENAME CONSTRAINT "player_skills_history_period_not_null" TO "player_advancements_history_period_not_null";--> statement-breakpoint
-- The versioning trigger names its history table in its arguments, so it is
-- recreated rather than renamed.
DROP TRIGGER IF EXISTS player_skills_versioning ON "game_data"."player_advancements";--> statement-breakpoint
CREATE TRIGGER player_advancements_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."player_advancements"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.player_advancements_history',
    true, true, true, false, true, 'history_version'
  );--> statement-breakpoint
ALTER TRIGGER player_skills_set_updated_at ON "game_data"."player_advancements" RENAME TO player_advancements_set_updated_at;
