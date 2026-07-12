CREATE TABLE "game_data"."matches_external_ids" (
	"id" serial PRIMARY KEY,
	"match_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "matches_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."matches_external_ids_history" (LIKE "game_data"."matches_external_ids");
--> statement-breakpoint
ALTER TABLE "game_data"."matches_external_ids" ADD CONSTRAINT "matches_external_ids_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "game_data"."matches"("id");--> statement-breakpoint
ALTER TABLE "game_data"."matches_external_ids" ADD CONSTRAINT "matches_external_ids_Fg5zBqg3fOib_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."matches_external_ids_history" ADD CONSTRAINT "matches_external_ids_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."matches_external_ids_history" ADD CONSTRAINT "matches_external_ids_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."matches_external_ids"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS matches_external_ids_versioning ON "game_data"."matches_external_ids";
--> statement-breakpoint
CREATE TRIGGER matches_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."matches_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.matches_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS matches_external_ids_set_updated_at ON "game_data"."matches_external_ids";
--> statement-breakpoint
CREATE TRIGGER matches_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."matches_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
