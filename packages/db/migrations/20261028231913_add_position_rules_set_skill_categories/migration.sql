CREATE TYPE "game_data"."skill_access" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TABLE "game_data"."position_rules_set_skill_categories" (
	"id" serial PRIMARY KEY,
	"position_rules_set_id" integer NOT NULL,
	"skill_category" "game_data"."skill_category" NOT NULL,
	"access" "game_data"."skill_access" NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "position_rules_set_skill_categories_anchor_category_unique" UNIQUE("position_rules_set_id","skill_category")
);
--> statement-breakpoint
CREATE TABLE "game_data"."position_rules_set_skill_categories_history" (LIKE "game_data"."position_rules_set_skill_categories");
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_skill_categories" ADD CONSTRAINT "position_rules_set_skill_categories_Duubz1897a0c_fkey" FOREIGN KEY ("position_rules_set_id") REFERENCES "game_data"."position_rules_sets"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_skill_categories_history" ADD CONSTRAINT "position_rules_set_skill_categories_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_skill_categories_history" ADD CONSTRAINT "position_rules_set_skill_categories_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."position_rules_set_skill_categories"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS position_rules_set_skill_categories_versioning ON "game_data"."position_rules_set_skill_categories";
--> statement-breakpoint
CREATE TRIGGER position_rules_set_skill_categories_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."position_rules_set_skill_categories"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.position_rules_set_skill_categories_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS position_rules_set_skill_categories_set_updated_at ON "game_data"."position_rules_set_skill_categories";
--> statement-breakpoint
CREATE TRIGGER position_rules_set_skill_categories_set_updated_at
  BEFORE UPDATE ON "game_data"."position_rules_set_skill_categories"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
