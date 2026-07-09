CREATE TABLE "game_data"."eras_external_ids" (
	"id" serial PRIMARY KEY,
	"era_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "eras_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."eras_external_ids_history" (
	"id" integer,
	"era_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "eras_external_ids_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
CREATE TABLE "game_data"."rules_sets_external_ids" (
	"id" serial PRIMARY KEY,
	"rules_set_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "rules_sets_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."rules_sets_external_ids_history" (
	"id" integer,
	"rules_set_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"history_version" integer,
	"history_period" tstzrange NOT NULL,
	CONSTRAINT "rules_sets_external_ids_history_pkey" PRIMARY KEY("id","history_version")
);
--> statement-breakpoint
ALTER TABLE "game_data"."eras" DROP CONSTRAINT "eras_external_system_id_external_systems_id_fkey";--> statement-breakpoint
ALTER TABLE "game_data"."eras" DROP COLUMN "external_system_id";--> statement-breakpoint
ALTER TABLE "game_data"."eras_history" ALTER COLUMN "external_system_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."eras_external_ids" ADD CONSTRAINT "eras_external_ids_era_id_eras_id_fkey" FOREIGN KEY ("era_id") REFERENCES "game_data"."eras"("id");--> statement-breakpoint
ALTER TABLE "game_data"."eras_external_ids" ADD CONSTRAINT "eras_external_ids_external_system_id_external_systems_id_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");--> statement-breakpoint
ALTER TABLE "game_data"."eras_external_ids_history" ADD CONSTRAINT "eras_external_ids_history_id_eras_external_ids_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."eras_external_ids"("id");--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_external_ids" ADD CONSTRAINT "rules_sets_external_ids_rules_set_id_rules_sets_id_fkey" FOREIGN KEY ("rules_set_id") REFERENCES "game_data"."rules_sets"("id");--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_external_ids" ADD CONSTRAINT "rules_sets_external_ids_4L7WdhJAFujh_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_external_ids_history" ADD CONSTRAINT "rules_sets_external_ids_history_xK71xko5KF3o_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."rules_sets_external_ids"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."eras_external_ids_history" ALTER CONSTRAINT "eras_external_ids_history_id_eras_external_ids_id_fkey" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS eras_external_ids_versioning ON "game_data"."eras_external_ids";
--> statement-breakpoint
CREATE TRIGGER eras_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."eras_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.eras_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS eras_external_ids_set_updated_at ON "game_data"."eras_external_ids";
--> statement-breakpoint
CREATE TRIGGER eras_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."eras_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_external_ids_history" ALTER CONSTRAINT "rules_sets_external_ids_history_xK71xko5KF3o_fkey" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS rules_sets_external_ids_versioning ON "game_data"."rules_sets_external_ids";
--> statement-breakpoint
CREATE TRIGGER rules_sets_external_ids_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."rules_sets_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.rules_sets_external_ids_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS rules_sets_external_ids_set_updated_at ON "game_data"."rules_sets_external_ids";
--> statement-breakpoint
CREATE TRIGGER rules_sets_external_ids_set_updated_at
  BEFORE UPDATE ON "game_data"."rules_sets_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
