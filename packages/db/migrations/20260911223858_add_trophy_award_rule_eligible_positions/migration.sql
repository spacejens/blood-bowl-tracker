CREATE TABLE "game_data"."trophy_award_rule_eligible_positions" (
	"id" serial PRIMARY KEY,
	"trophy_id" integer NOT NULL,
	"position_name_external_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "trophy_award_rule_eligible_positions_trophy_position_unique" UNIQUE("trophy_id","position_name_external_id")
);
--> statement-breakpoint
CREATE TABLE "game_data"."trophy_award_rule_eligible_positions_history" (LIKE "game_data"."trophy_award_rule_eligible_positions");
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_eligible_positions" ADD CONSTRAINT "trophy_award_rule_eligible_positions_trophy_id_trophies_id_fkey" FOREIGN KEY ("trophy_id") REFERENCES "game_data"."trophies"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_eligible_positions_history" ADD CONSTRAINT "trophy_award_rule_eligible_positions_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "game_data"."trophy_award_rule_eligible_positions_history" ADD CONSTRAINT "trophy_award_rule_eligible_positions_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."trophy_award_rule_eligible_positions"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_award_rule_eligible_positions_versioning ON "game_data"."trophy_award_rule_eligible_positions";
--> statement-breakpoint
CREATE TRIGGER trophy_award_rule_eligible_positions_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "game_data"."trophy_award_rule_eligible_positions"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'game_data.trophy_award_rule_eligible_positions_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS trophy_award_rule_eligible_positions_set_updated_at ON "game_data"."trophy_award_rule_eligible_positions";
--> statement-breakpoint
CREATE TRIGGER trophy_award_rule_eligible_positions_set_updated_at
  BEFORE UPDATE ON "game_data"."trophy_award_rule_eligible_positions"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
