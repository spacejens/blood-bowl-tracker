CREATE TABLE "game_data"."manual_import_batches" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL UNIQUE,
	"content_hash" varchar(64) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_data"."manual_import_batches_history" (LIKE "game_data"."manual_import_batches");
--> statement-breakpoint
ALTER TABLE "game_data"."manual_import_batches_history" ADD CONSTRAINT "manual_import_batches_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."manual_import_batches_history" ADD CONSTRAINT "manual_import_batches_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."manual_import_batches"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS manual_import_batches_versioning ON "game_data"."manual_import_batches";
--> statement-breakpoint
CREATE TRIGGER manual_import_batches_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."manual_import_batches"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.manual_import_batches_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS manual_import_batches_set_updated_at ON "game_data"."manual_import_batches";
--> statement-breakpoint
CREATE TRIGGER manual_import_batches_set_updated_at
  BEFORE UPDATE ON "game_data"."manual_import_batches"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
