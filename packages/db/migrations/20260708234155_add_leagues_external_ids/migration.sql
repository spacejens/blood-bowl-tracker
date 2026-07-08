CREATE TABLE "game_data"."leagues_external_ids" (
	"id" serial PRIMARY KEY,
	"league_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "leagues_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."leagues_external_ids_history" (
	"id" integer,
	"league_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "leagues_external_ids_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
ALTER TABLE "game_data"."leagues_external_ids" ADD CONSTRAINT "leagues_external_ids_league_id_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "game_data"."leagues"("id");--> statement-breakpoint
ALTER TABLE "game_data"."leagues_external_ids" ADD CONSTRAINT "leagues_external_ids_Fg5zBqgaeu9q_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");--> statement-breakpoint
ALTER TABLE "game_data"."leagues_external_ids_history" ADD CONSTRAINT "leagues_external_ids_history_id_leagues_external_ids_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."leagues_external_ids"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."leagues_external_ids_history" ALTER CONSTRAINT "leagues_external_ids_history_id_leagues_external_ids_id_fkey" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS leagues_external_ids_versioning ON "game_data"."leagues_external_ids";
--> statement-breakpoint
CREATE TRIGGER leagues_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."leagues_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.leagues_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS leagues_external_ids_set_updated_at ON "game_data"."leagues_external_ids";
--> statement-breakpoint
CREATE TRIGGER leagues_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."leagues_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
