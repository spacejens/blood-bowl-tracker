CREATE TABLE "game_data"."coach_external_ids" (
	"id" serial PRIMARY KEY,
	"coach_id" integer NOT NULL,
	"external_system_id" integer NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_external_ids_external_system_id_external_id_unique" UNIQUE("external_system_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."external_systems" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- WARNING: this column has no default. If the "eras" table already has rows in this
-- database, this ALTER TABLE will fail — existing rows would need external_system_id
-- backfilled manually (e.g. by creating an appropriate external system and updating
-- existing eras to reference it) before this migration can be applied.
ALTER TABLE "game_data"."eras" ADD COLUMN "external_system_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."coach_external_ids" ADD CONSTRAINT "coach_external_ids_coach_id_coaches_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "game_data"."coaches"("id");--> statement-breakpoint
ALTER TABLE "game_data"."coach_external_ids" ADD CONSTRAINT "coach_external_ids_external_system_id_external_systems_id_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");--> statement-breakpoint
ALTER TABLE "game_data"."eras" ADD CONSTRAINT "eras_external_system_id_external_systems_id_fkey" FOREIGN KEY ("external_system_id") REFERENCES "game_data"."external_systems"("id");