CREATE TYPE "game_data"."skill_category" AS ENUM('general', 'agility', 'passing', 'strength', 'mutation', 'devious', 'trait');--> statement-breakpoint
CREATE TABLE "game_data"."position_rules_set_skills" (
	"id" serial PRIMARY KEY,
	"position_rules_set_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"is_star_player_unique_skill" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "position_rules_set_skills_position_rules_set_id_skill_id_unique" UNIQUE("position_rules_set_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."position_rules_set_skills_history" (LIKE "game_data"."position_rules_set_skills");
--> statement-breakpoint
CREATE TABLE "game_data"."skill_rules_sets" (
	"id" serial PRIMARY KEY,
	"skill_id" integer NOT NULL,
	"rules_set_id" integer NOT NULL,
	"category" "game_data"."skill_category" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "skill_rules_sets_skill_id_rules_set_id_unique" UNIQUE("skill_id","rules_set_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."skill_rules_sets_history" (LIKE "game_data"."skill_rules_sets");
--> statement-breakpoint
CREATE TABLE "game_data"."skills" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_data"."skills_history" (LIKE "game_data"."skills");
--> statement-breakpoint
CREATE TABLE "game_data"."skills_external_ids" (
	"id" serial PRIMARY KEY,
	"skill_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "skills_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."skills_external_ids_history" (LIKE "game_data"."skills_external_ids");
--> statement-breakpoint
CREATE UNIQUE INDEX "position_rules_set_skills_one_star_player_unique_skill" ON "game_data"."position_rules_set_skills" ("position_rules_set_id") WHERE "is_star_player_unique_skill" = true;--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_skills" ADD CONSTRAINT "position_rules_set_skills_vRafK7R4aLbg_fkey" FOREIGN KEY ("position_rules_set_id") REFERENCES "game_data"."position_rules_sets"("id");--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_skills" ADD CONSTRAINT "position_rules_set_skills_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "game_data"."skills"("id");--> statement-breakpoint
ALTER TABLE "game_data"."skill_rules_sets" ADD CONSTRAINT "skill_rules_sets_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "game_data"."skills"("id");--> statement-breakpoint
ALTER TABLE "game_data"."skill_rules_sets" ADD CONSTRAINT "skill_rules_sets_rules_set_id_rules_sets_id_fkey" FOREIGN KEY ("rules_set_id") REFERENCES "game_data"."rules_sets"("id");--> statement-breakpoint
ALTER TABLE "game_data"."skills_external_ids" ADD CONSTRAINT "skills_external_ids_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "game_data"."skills"("id");--> statement-breakpoint
ALTER TABLE "game_data"."skills_external_ids" ADD CONSTRAINT "skills_external_ids_external_system_id_external_systems_id_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_skills_history" ADD CONSTRAINT "position_rules_set_skills_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_skills_history" ADD CONSTRAINT "position_rules_set_skills_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."position_rules_set_skills"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS position_rules_set_skills_versioning ON "game_data"."position_rules_set_skills";
--> statement-breakpoint
CREATE TRIGGER position_rules_set_skills_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."position_rules_set_skills"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.position_rules_set_skills_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS position_rules_set_skills_set_updated_at ON "game_data"."position_rules_set_skills";
--> statement-breakpoint
CREATE TRIGGER position_rules_set_skills_set_updated_at
  BEFORE UPDATE ON "game_data"."position_rules_set_skills"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."skill_rules_sets_history" ADD CONSTRAINT "skill_rules_sets_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."skill_rules_sets_history" ADD CONSTRAINT "skill_rules_sets_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."skill_rules_sets"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS skill_rules_sets_versioning ON "game_data"."skill_rules_sets";
--> statement-breakpoint
CREATE TRIGGER skill_rules_sets_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."skill_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.skill_rules_sets_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS skill_rules_sets_set_updated_at ON "game_data"."skill_rules_sets";
--> statement-breakpoint
CREATE TRIGGER skill_rules_sets_set_updated_at
  BEFORE UPDATE ON "game_data"."skill_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."skills_history" ADD CONSTRAINT "skills_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."skills_history" ADD CONSTRAINT "skills_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."skills"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS skills_versioning ON "game_data"."skills";
--> statement-breakpoint
CREATE TRIGGER skills_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."skills"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.skills_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS skills_set_updated_at ON "game_data"."skills";
--> statement-breakpoint
CREATE TRIGGER skills_set_updated_at
  BEFORE UPDATE ON "game_data"."skills"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."skills_external_ids_history" ADD CONSTRAINT "skills_external_ids_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."skills_external_ids_history" ADD CONSTRAINT "skills_external_ids_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."skills_external_ids"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS skills_external_ids_versioning ON "game_data"."skills_external_ids";
--> statement-breakpoint
CREATE TRIGGER skills_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."skills_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.skills_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS skills_external_ids_set_updated_at ON "game_data"."skills_external_ids";
--> statement-breakpoint
CREATE TRIGGER skills_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."skills_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
