CREATE TYPE "game_data"."keyword_kind" AS ENUM('species', 'positional', 'special');--> statement-breakpoint
CREATE TABLE "game_data"."keywords" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"kind" "game_data"."keyword_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_data"."keywords_history" (LIKE "game_data"."keywords");
--> statement-breakpoint
CREATE TABLE "game_data"."keywords_external_ids" (
	"id" serial PRIMARY KEY,
	"keyword_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "keywords_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."keywords_external_ids_history" (LIKE "game_data"."keywords_external_ids");
--> statement-breakpoint
CREATE TABLE "game_data"."position_rules_set_keywords" (
	"id" serial PRIMARY KEY,
	"position_rules_set_id" integer NOT NULL,
	"keyword_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "position_rules_set_keywords_position_rules_set_id_keyword_id" UNIQUE("position_rules_set_id","keyword_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."position_rules_set_keywords_history" (LIKE "game_data"."position_rules_set_keywords");
--> statement-breakpoint
ALTER TABLE "game_data"."keywords_external_ids" ADD CONSTRAINT "keywords_external_ids_keyword_id_keywords_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "game_data"."keywords"("id");--> statement-breakpoint
ALTER TABLE "game_data"."keywords_external_ids" ADD CONSTRAINT "keywords_external_ids_gKLqZrpfZ5XA_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_keywords" ADD CONSTRAINT "position_rules_set_keywords_R8Gfo98NOopG_fkey" FOREIGN KEY ("position_rules_set_id") REFERENCES "game_data"."position_rules_sets"("id");--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_keywords" ADD CONSTRAINT "position_rules_set_keywords_keyword_id_keywords_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "game_data"."keywords"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."keywords_history" ADD CONSTRAINT "keywords_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."keywords_history" ADD CONSTRAINT "keywords_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."keywords"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS keywords_versioning ON "game_data"."keywords";
--> statement-breakpoint
CREATE TRIGGER keywords_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."keywords"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.keywords_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS keywords_set_updated_at ON "game_data"."keywords";
--> statement-breakpoint
CREATE TRIGGER keywords_set_updated_at
  BEFORE UPDATE ON "game_data"."keywords"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."keywords_external_ids_history" ADD CONSTRAINT "keywords_external_ids_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."keywords_external_ids_history" ADD CONSTRAINT "keywords_external_ids_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."keywords_external_ids"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS keywords_external_ids_versioning ON "game_data"."keywords_external_ids";
--> statement-breakpoint
CREATE TRIGGER keywords_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."keywords_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.keywords_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS keywords_external_ids_set_updated_at ON "game_data"."keywords_external_ids";
--> statement-breakpoint
CREATE TRIGGER keywords_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."keywords_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_keywords_history" ADD CONSTRAINT "position_rules_set_keywords_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_set_keywords_history" ADD CONSTRAINT "position_rules_set_keywords_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."position_rules_set_keywords"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS position_rules_set_keywords_versioning ON "game_data"."position_rules_set_keywords";
--> statement-breakpoint
CREATE TRIGGER position_rules_set_keywords_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."position_rules_set_keywords"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.position_rules_set_keywords_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS position_rules_set_keywords_set_updated_at ON "game_data"."position_rules_set_keywords";
--> statement-breakpoint
CREATE TRIGGER position_rules_set_keywords_set_updated_at
  BEFORE UPDATE ON "game_data"."position_rules_set_keywords"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
