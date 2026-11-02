CREATE TYPE "game_data"."player_characteristic" AS ENUM('MA', 'ST', 'AG', 'PA', 'AV');--> statement-breakpoint
-- The source enum gains `characteristic`. drizzle applies all pending
-- migrations in one transaction, and a value added with ALTER TYPE ... ADD
-- VALUE cannot be used before that transaction commits, so the type is
-- rebuilt instead. The starting-order check refers to the old type and is
-- re-added once the columns use the new one.
ALTER TABLE "game_data"."player_advancements" DROP CONSTRAINT "player_advancements_starting_has_no_order";--> statement-breakpoint
ALTER TYPE "game_data"."player_advancement_source" RENAME TO "player_advancement_source_old";--> statement-breakpoint
CREATE TYPE "game_data"."player_advancement_source" AS ENUM('starting', 'advancement', 'chosen', 'random', 'characteristic');--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ALTER COLUMN "source" SET DATA TYPE "game_data"."player_advancement_source" USING "source"::text::"game_data"."player_advancement_source";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" ALTER COLUMN "source" SET DATA TYPE "game_data"."player_advancement_source" USING "source"::text::"game_data"."player_advancement_source";--> statement-breakpoint
DROP TYPE "game_data"."player_advancement_source_old";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD CONSTRAINT "player_advancements_starting_has_no_order" CHECK ("source" != 'starting' OR "advancement_order" IS NULL);--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" DROP CONSTRAINT "player_advancements_player_id_skill_id_attribute_value_unique";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ALTER COLUMN "skill_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" ALTER COLUMN "skill_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD COLUMN "characteristic" "game_data"."player_characteristic";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD COLUMN "order_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD COLUMN "removed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" ADD COLUMN "characteristic" "game_data"."player_characteristic";--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" ADD COLUMN "order_confirmed" boolean;--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements_history" ADD COLUMN "removed" boolean;--> statement-breakpoint
CREATE UNIQUE INDEX "player_advancements_skill_with_attribute_unique" ON "game_data"."player_advancements" ("player_id","skill_id","attribute_value") WHERE "skill_id" IS NOT NULL AND "attribute_value" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "player_advancements_skill_without_attribute_unique" ON "game_data"."player_advancements" ("player_id","skill_id") WHERE "skill_id" IS NOT NULL AND "attribute_value" IS NULL;--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD CONSTRAINT "player_advancements_skill_or_characteristic" CHECK (("source" = 'characteristic' AND "characteristic" IS NOT NULL AND "skill_id" IS NULL) OR ("source" <> 'characteristic' AND "characteristic" IS NULL AND "skill_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD CONSTRAINT "player_advancements_characteristic_has_no_skill_fields" CHECK ("source" <> 'characteristic' OR ("attribute_value" IS NULL AND "is_free_extra" = false));--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD CONSTRAINT "player_advancements_confirmed_has_order" CHECK ("order_confirmed" = false OR "advancement_order" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "game_data"."player_advancements" ADD CONSTRAINT "player_advancements_only_characteristic_removed" CHECK ("removed" = false OR "source" = 'characteristic');
