CREATE TABLE "game_data"."competitions_external_ids" (
	"id" serial PRIMARY KEY,
	"competition_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "competitions_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."competitions_external_ids_history" (LIKE "game_data"."competitions_external_ids");
--> statement-breakpoint
ALTER TABLE "game_data"."competitions_external_ids" ADD CONSTRAINT "competitions_external_ids_competition_id_competitions_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "game_data"."competitions"("id");--> statement-breakpoint
ALTER TABLE "game_data"."competitions_external_ids" ADD CONSTRAINT "competitions_external_ids_FbtmpJSOvGGk_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."competitions_external_ids_history" ADD CONSTRAINT "competitions_external_ids_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."competitions_external_ids_history" ADD CONSTRAINT "competitions_external_ids_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."competitions_external_ids"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS competitions_external_ids_versioning ON "game_data"."competitions_external_ids";
--> statement-breakpoint
CREATE TRIGGER competitions_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."competitions_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.competitions_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS competitions_external_ids_set_updated_at ON "game_data"."competitions_external_ids";
--> statement-breakpoint
CREATE TRIGGER competitions_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."competitions_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
