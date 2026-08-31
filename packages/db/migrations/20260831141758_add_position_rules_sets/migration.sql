CREATE TYPE "game_data"."characteristic_format" AS ENUM('absent', 'bare', 'plus');--> statement-breakpoint
CREATE TABLE "game_data"."position_rules_sets" (
	"id" serial PRIMARY KEY,
	"position_id" integer NOT NULL,
	"rules_set_id" integer NOT NULL,
	"move" integer NOT NULL,
	"strength" integer NOT NULL,
	"agility" integer NOT NULL,
	"passing" integer,
	"armour" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "position_rules_sets_position_id_rules_set_id_unique" UNIQUE("position_id","rules_set_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."position_rules_sets_history" (LIKE "game_data"."position_rules_sets");
--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets" ADD COLUMN "move_format" "game_data"."characteristic_format" DEFAULT 'bare'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets" ADD COLUMN "strength_format" "game_data"."characteristic_format" DEFAULT 'bare'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets" ADD COLUMN "agility_format" "game_data"."characteristic_format" DEFAULT 'bare'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets" ADD COLUMN "passing_format" "game_data"."characteristic_format" DEFAULT 'absent'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets" ADD COLUMN "armour_format" "game_data"."characteristic_format" DEFAULT 'bare'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_history" ADD COLUMN "move_format" "game_data"."characteristic_format" DEFAULT 'bare'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_history" ADD COLUMN "strength_format" "game_data"."characteristic_format" DEFAULT 'bare'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_history" ADD COLUMN "agility_format" "game_data"."characteristic_format" DEFAULT 'bare'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_history" ADD COLUMN "passing_format" "game_data"."characteristic_format" DEFAULT 'absent'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."rules_sets_history" ADD COLUMN "armour_format" "game_data"."characteristic_format" DEFAULT 'bare'::"game_data"."characteristic_format" NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_sets" ADD CONSTRAINT "position_rules_sets_position_id_positions_id_fkey" FOREIGN KEY ("position_id") REFERENCES "game_data"."positions"("id");--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_sets" ADD CONSTRAINT "position_rules_sets_rules_set_id_rules_sets_id_fkey" FOREIGN KEY ("rules_set_id") REFERENCES "game_data"."rules_sets"("id");
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_sets_history" ADD CONSTRAINT "position_rules_sets_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."position_rules_sets_history" ADD CONSTRAINT "position_rules_sets_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."position_rules_sets"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS position_rules_sets_versioning ON "game_data"."position_rules_sets";
--> statement-breakpoint
CREATE TRIGGER position_rules_sets_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."position_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.position_rules_sets_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS position_rules_sets_set_updated_at ON "game_data"."position_rules_sets";
--> statement-breakpoint
CREATE TRIGGER position_rules_sets_set_updated_at
  BEFORE UPDATE ON "game_data"."position_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
