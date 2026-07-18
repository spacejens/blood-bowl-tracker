CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
ALTER TRIGGER coaches_versioning ON "game_data"."coaches" RENAME TO "0_coaches_versioning";
--> statement-breakpoint
ALTER TRIGGER external_systems_versioning ON "game_data"."external_systems" RENAME TO "0_external_systems_versioning";
--> statement-breakpoint
ALTER TRIGGER coaches_external_ids_versioning ON "game_data"."coaches_external_ids" RENAME TO "0_coaches_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER leagues_versioning ON "game_data"."leagues" RENAME TO "0_leagues_versioning";
--> statement-breakpoint
ALTER TRIGGER eras_versioning ON "game_data"."eras" RENAME TO "0_eras_versioning";
--> statement-breakpoint
ALTER TRIGGER competitions_versioning ON "game_data"."competitions" RENAME TO "0_competitions_versioning";
--> statement-breakpoint
ALTER TRIGGER competitions_external_ids_versioning ON "game_data"."competitions_external_ids" RENAME TO "0_competitions_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER races_versioning ON "game_data"."races" RENAME TO "0_races_versioning";
--> statement-breakpoint
ALTER TRIGGER teams_versioning ON "game_data"."teams" RENAME TO "0_teams_versioning";
--> statement-breakpoint
ALTER TRIGGER team_eras_versioning ON "game_data"."team_eras" RENAME TO "0_team_eras_versioning";
--> statement-breakpoint
ALTER TRIGGER competition_teams_versioning ON "game_data"."competition_teams" RENAME TO "0_competition_teams_versioning";
--> statement-breakpoint
ALTER TRIGGER rules_sets_versioning ON "game_data"."rules_sets" RENAME TO "0_rules_sets_versioning";
--> statement-breakpoint
ALTER TRIGGER era_rules_sets_versioning ON "game_data"."era_rules_sets" RENAME TO "0_era_rules_sets_versioning";
--> statement-breakpoint
ALTER TRIGGER eras_external_ids_versioning ON "game_data"."eras_external_ids" RENAME TO "0_eras_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER leagues_external_ids_versioning ON "game_data"."leagues_external_ids" RENAME TO "0_leagues_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER matches_versioning ON "game_data"."matches" RENAME TO "0_matches_versioning";
--> statement-breakpoint
ALTER TRIGGER match_teams_versioning ON "game_data"."match_teams" RENAME TO "0_match_teams_versioning";
--> statement-breakpoint
ALTER TRIGGER positions_versioning ON "game_data"."positions" RENAME TO "0_positions_versioning";
--> statement-breakpoint
ALTER TRIGGER players_versioning ON "game_data"."players" RENAME TO "0_players_versioning";
--> statement-breakpoint
ALTER TRIGGER match_events_versioning ON "game_data"."match_events" RENAME TO "0_match_events_versioning";
--> statement-breakpoint
ALTER TRIGGER match_events_external_ids_versioning ON "game_data"."match_events_external_ids" RENAME TO "0_match_events_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER matches_external_ids_versioning ON "game_data"."matches_external_ids" RENAME TO "0_matches_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER players_external_ids_versioning ON "game_data"."players_external_ids" RENAME TO "0_players_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER positions_external_ids_versioning ON "game_data"."positions_external_ids" RENAME TO "0_positions_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER race_eras_versioning ON "game_data"."race_eras" RENAME TO "0_race_eras_versioning";
--> statement-breakpoint
ALTER TRIGGER positions_race_eras_versioning ON "game_data"."positions_race_eras" RENAME TO "0_positions_race_eras_versioning";
--> statement-breakpoint
ALTER TRIGGER races_external_ids_versioning ON "game_data"."races_external_ids" RENAME TO "0_races_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER rules_sets_external_ids_versioning ON "game_data"."rules_sets_external_ids" RENAME TO "0_rules_sets_external_ids_versioning";
--> statement-breakpoint
ALTER TRIGGER teams_external_ids_versioning ON "game_data"."teams_external_ids" RENAME TO "0_teams_external_ids_versioning";
