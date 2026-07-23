CREATE TYPE "game_data"."external_system_category" AS ENUM('bookkeeping', 'imported_data_source', 'referenced_not_imported');--> statement-breakpoint
ALTER TABLE "game_data"."external_systems" DISABLE TRIGGER external_systems_versioning;--> statement-breakpoint
ALTER TABLE "game_data"."external_systems" ADD COLUMN "category" "game_data"."external_system_category";--> statement-breakpoint
ALTER TABLE "game_data"."external_systems_history" ADD COLUMN "category" "game_data"."external_system_category";--> statement-breakpoint
UPDATE "game_data"."external_systems" SET "category" = CASE WHEN "is_bookkeeping" THEN 'bookkeeping'::"game_data"."external_system_category" ELSE 'imported_data_source'::"game_data"."external_system_category" END;--> statement-breakpoint
UPDATE "game_data"."external_systems_history" SET "category" = CASE WHEN "is_bookkeeping" THEN 'bookkeeping'::"game_data"."external_system_category" ELSE 'imported_data_source'::"game_data"."external_system_category" END;--> statement-breakpoint
UPDATE "game_data"."external_systems" SET "category" = 'referenced_not_imported' WHERE "name" = 'NAF';--> statement-breakpoint
UPDATE "game_data"."external_systems_history" SET "category" = 'referenced_not_imported' WHERE "name" = 'NAF';--> statement-breakpoint
ALTER TABLE "game_data"."external_systems" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."external_systems_history" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."external_systems" DROP COLUMN "is_bookkeeping";--> statement-breakpoint
ALTER TABLE "game_data"."external_systems_history" ALTER COLUMN "is_bookkeeping" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."external_systems" ENABLE TRIGGER external_systems_versioning;
