CREATE OR REPLACE FUNCTION reject_no_op_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_coaches_reject_no_op_update" ON "game_data"."coaches";
--> statement-breakpoint
CREATE TRIGGER "0_coaches_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."coaches"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_external_systems_reject_no_op_update" ON "game_data"."external_systems";
--> statement-breakpoint
CREATE TRIGGER "0_external_systems_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."external_systems"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_coaches_external_ids_reject_no_op_update" ON "game_data"."coaches_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_coaches_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."coaches_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_leagues_reject_no_op_update" ON "game_data"."leagues";
--> statement-breakpoint
CREATE TRIGGER "0_leagues_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."leagues"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_eras_reject_no_op_update" ON "game_data"."eras";
--> statement-breakpoint
CREATE TRIGGER "0_eras_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."eras"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_competitions_reject_no_op_update" ON "game_data"."competitions";
--> statement-breakpoint
CREATE TRIGGER "0_competitions_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."competitions"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_competitions_external_ids_reject_no_op_update" ON "game_data"."competitions_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_competitions_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."competitions_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_races_reject_no_op_update" ON "game_data"."races";
--> statement-breakpoint
CREATE TRIGGER "0_races_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."races"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_teams_reject_no_op_update" ON "game_data"."teams";
--> statement-breakpoint
CREATE TRIGGER "0_teams_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."teams"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_team_eras_reject_no_op_update" ON "game_data"."team_eras";
--> statement-breakpoint
CREATE TRIGGER "0_team_eras_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."team_eras"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_competition_teams_reject_no_op_update" ON "game_data"."competition_teams";
--> statement-breakpoint
CREATE TRIGGER "0_competition_teams_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."competition_teams"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_rules_sets_reject_no_op_update" ON "game_data"."rules_sets";
--> statement-breakpoint
CREATE TRIGGER "0_rules_sets_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_era_rules_sets_reject_no_op_update" ON "game_data"."era_rules_sets";
--> statement-breakpoint
CREATE TRIGGER "0_era_rules_sets_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."era_rules_sets"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_eras_external_ids_reject_no_op_update" ON "game_data"."eras_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_eras_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."eras_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_leagues_external_ids_reject_no_op_update" ON "game_data"."leagues_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_leagues_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."leagues_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_matches_reject_no_op_update" ON "game_data"."matches";
--> statement-breakpoint
CREATE TRIGGER "0_matches_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."matches"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_match_teams_reject_no_op_update" ON "game_data"."match_teams";
--> statement-breakpoint
CREATE TRIGGER "0_match_teams_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."match_teams"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_positions_reject_no_op_update" ON "game_data"."positions";
--> statement-breakpoint
CREATE TRIGGER "0_positions_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."positions"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_players_reject_no_op_update" ON "game_data"."players";
--> statement-breakpoint
CREATE TRIGGER "0_players_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."players"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_match_events_reject_no_op_update" ON "game_data"."match_events";
--> statement-breakpoint
CREATE TRIGGER "0_match_events_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."match_events"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_match_events_external_ids_reject_no_op_update" ON "game_data"."match_events_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_match_events_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."match_events_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_matches_external_ids_reject_no_op_update" ON "game_data"."matches_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_matches_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."matches_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_players_external_ids_reject_no_op_update" ON "game_data"."players_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_players_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."players_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_positions_external_ids_reject_no_op_update" ON "game_data"."positions_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_positions_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."positions_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_race_eras_reject_no_op_update" ON "game_data"."race_eras";
--> statement-breakpoint
CREATE TRIGGER "0_race_eras_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."race_eras"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_positions_race_eras_reject_no_op_update" ON "game_data"."positions_race_eras";
--> statement-breakpoint
CREATE TRIGGER "0_positions_race_eras_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."positions_race_eras"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_races_external_ids_reject_no_op_update" ON "game_data"."races_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_races_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."races_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_rules_sets_external_ids_reject_no_op_update" ON "game_data"."rules_sets_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_rules_sets_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."rules_sets_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "0_teams_external_ids_reject_no_op_update" ON "game_data"."teams_external_ids";
--> statement-breakpoint
CREATE TRIGGER "0_teams_external_ids_reject_no_op_update"
  BEFORE UPDATE ON "game_data"."teams_external_ids"
  FOR EACH ROW EXECUTE PROCEDURE reject_no_op_update();
