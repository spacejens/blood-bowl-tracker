CREATE TABLE "game_data"."coaches_external_ids" (
	"id" serial PRIMARY KEY,
	"coach_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "coaches_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."coaches_external_ids_history" (
	"id" integer,
	"coach_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "coaches_external_ids_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
ALTER TABLE "game_data"."coach_external_ids_history" DROP CONSTRAINT "coach_external_ids_history_id_coach_external_ids_id_fkey";--> statement-breakpoint
DROP TABLE "game_data"."coach_external_ids";--> statement-breakpoint
DROP TABLE "game_data"."coach_external_ids_history";--> statement-breakpoint
ALTER TABLE "game_data"."coaches_external_ids" ADD CONSTRAINT "coaches_external_ids_coach_id_coaches_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "game_data"."coaches"("id");--> statement-breakpoint
ALTER TABLE "game_data"."coaches_external_ids" ADD CONSTRAINT "coaches_external_ids_Fg5zBqg3fABa_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");--> statement-breakpoint
ALTER TABLE "game_data"."coaches_external_ids_history" ADD CONSTRAINT "coaches_external_ids_history_id_coaches_external_ids_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."coaches_external_ids"("id");
--> statement-breakpoint
DROP TRIGGER IF EXISTS coaches_external_ids_versioning ON "game_data"."coaches_external_ids";
--> statement-breakpoint
CREATE TRIGGER coaches_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."coaches_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.coaches_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS coaches_external_ids_set_updated_at ON "game_data"."coaches_external_ids";
--> statement-breakpoint
CREATE TRIGGER coaches_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."coaches_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
