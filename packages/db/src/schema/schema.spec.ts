import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  characteristicFormatEnum,
  coaches,
  coachExternalIds,
  competitionGroups,
  competitions,
  competitionTeams,
  eraRulesSets,
  eras,
  externalSystems,
  leagues,
  matches,
  matchEventExternalIds,
  matchEvents,
  matchTeams,
  players,
  positionExternalIds,
  positionRulesSets,
  positions,
  positionsRaceEras,
  raceEras,
  races,
  rulesSets,
  sppAwardValues,
  teamEras,
  teams,
  trophies,
  trophyAwards,
  trophyExternalIds,
} from './index';

describe('schema', () => {
  it('exports coaches table', () => {
    expect(coaches.id).toBeDefined();
    expect(coaches.name).toBeDefined();
  });

  it('exports races table', () => {
    expect(races.id).toBeDefined();
    expect(races.name).toBeDefined();
  });

  it('exports rulesSets table', () => {
    expect(rulesSets.id).toBeDefined();
    expect(rulesSets.name).toBeDefined();
  });

  it('exports leagues table', () => {
    expect(leagues.id).toBeDefined();
    expect(leagues.name).toBeDefined();
  });

  it('exports eras table', () => {
    expect(eras.id).toBeDefined();
    expect(eras.name).toBeDefined();
    expect(eras.leagueId).toBeDefined();
    expect(eras.startDate).toBeDefined();
    expect(eras.endDate).toBeDefined();
  });

  it('exports eraRulesSets join table', () => {
    expect(eraRulesSets.id).toBeDefined();
    expect(eraRulesSets.eraId).toBeDefined();
    expect(eraRulesSets.rulesSetId).toBeDefined();
  });

  it('exports raceEras join table', () => {
    expect(raceEras.id).toBeDefined();
    expect(raceEras.raceId).toBeDefined();
    expect(raceEras.eraId).toBeDefined();
  });

  it('exports externalSystems table', () => {
    expect(externalSystems.id).toBeDefined();
    expect(externalSystems.name).toBeDefined();
    expect(externalSystems.category).toBeDefined();
  });

  it('exports coachExternalIds join table', () => {
    expect(coachExternalIds.id).toBeDefined();
    expect(coachExternalIds.coachId).toBeDefined();
    expect(coachExternalIds.externalSystemId).toBeDefined();
    expect(coachExternalIds.externalId).toBeDefined();
  });

  it('exports positionExternalIds join table', () => {
    expect(positionExternalIds.id).toBeDefined();
    expect(positionExternalIds.positionId).toBeDefined();
    expect(positionExternalIds.externalSystemId).toBeDefined();
    expect(positionExternalIds.externalId).toBeDefined();
  });

  it('exports competitions table with type enum', () => {
    expect(competitions.id).toBeDefined();
    expect(competitions.name).toBeDefined();
    expect(competitions.type).toBeDefined();
    expect(competitions.eraId).toBeDefined();
  });

  it('exports competitions table with a competition group foreign key', () => {
    expect(competitions.competitionGroupId).toBeDefined();
    expect(competitions.competitionGroupId.notNull).toBe(true);
    expect(competitions.competitionGroupId.hasDefault).toBe(false);
  });

  it('exports competition groups table with a league foreign key', () => {
    expect(competitionGroups.id).toBeDefined();
    expect(competitionGroups.name).toBeDefined();
    expect(competitionGroups.leagueId).toBeDefined();
    expect(competitionGroups.name.notNull).toBe(true);
    expect(competitionGroups.leagueId.notNull).toBe(true);
    const config = getTableConfig(competitionGroups);
    expect(config.name).toBe('competition_groups');
    expect(config.schema).toBe('game_data');
  });

  it('exports competitionTeams join table', () => {
    expect(competitionTeams.id).toBeDefined();
    expect(competitionTeams.competitionId).toBeDefined();
    expect(competitionTeams.teamEraId).toBeDefined();
  });

  it('exports teamEras table', () => {
    expect(teamEras.id).toBeDefined();
    expect(teamEras.teamId).toBeDefined();
    expect(teamEras.eraId).toBeDefined();
  });

  it('exports teams table with FK columns', () => {
    expect(teams.id).toBeDefined();
    expect(teams.name).toBeDefined();
    expect(teams.raceId).toBeDefined();
    expect(teams.coachId).toBeDefined();
  });

  it('exports positions table', () => {
    expect(positions.id).toBeDefined();
    expect(positions.name).toBeDefined();
    expect(positions.isStarPlayer).toBeDefined();
  });

  it('exports positionsRaceEras join table with characteristics columns', () => {
    expect(positionsRaceEras.id).toBeDefined();
    expect(positionsRaceEras.positionId).toBeDefined();
    expect(positionsRaceEras.raceEraId).toBeDefined();
    expect(positionsRaceEras.move).toBeDefined();
    expect(positionsRaceEras.strength).toBeDefined();
    expect(positionsRaceEras.agility).toBeDefined();
    expect(positionsRaceEras.passing).toBeDefined();
    expect(positionsRaceEras.armour).toBeDefined();
  });

  it('positions_race_eras has a nullable passing and non-null everything else', () => {
    const config = getTableConfig(positionsRaceEras);
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    // Nullable on purpose: null permanently means "this rules set has no
    // Passing characteristic", never "not known yet".
    expect(byName.get('passing')!.notNull).toBe(false);
    expect(byName.get('passing')!.hasDefault).toBe(false);
    for (const name of [
      'position_id',
      'race_era_id',
      'move',
      'strength',
      'agility',
      'armour',
    ]) {
      expect(byName.get(name)!.notNull).toBe(true);
    }
  });

  it('positions_race_eras defaults the four required characteristics to 0', () => {
    const config = getTableConfig(positionsRaceEras);
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    for (const name of ['move', 'strength', 'agility', 'armour']) {
      expect(byName.get(name)!.default).toBe(0);
    }
  });

  it('exports players table with FK columns', () => {
    expect(players.id).toBeDefined();
    expect(players.name).toBeDefined();
    expect(players.teamEraId).toBeDefined();
    expect(players.positionId).toBeDefined();
  });

  it('exports players.spp_total as a nullable integer column', () => {
    const config = getTableConfig(players);
    const sppTotal = config.columns.find((c) => c.name === 'spp_total');
    expect(sppTotal).toBeDefined();
    // Nullable on purpose: NULL means no source has reported or computed a
    // total for this player yet (e.g. a TP induced star player).
    expect(sppTotal!.notNull).toBe(false);
    expect(sppTotal!.getSQLType()).toBe('integer');
  });

  it('exports players.spp_adjustment as a nullable integer column', () => {
    const config = getTableConfig(players);
    const sppAdjustment = config.columns.find(
      (c) => c.name === 'spp_adjustment',
    );
    expect(sppAdjustment).toBeDefined();
    // Nullable on purpose, mirroring spp_total: NULL means no source has
    // computed an adjustment for this player yet. A computed 0 is a real,
    // confirmed "no unexplained SPP" answer and is stored as 0, not NULL.
    expect(sppAdjustment!.notNull).toBe(false);
    expect(sppAdjustment!.getSQLType()).toBe('integer');
  });

  it('exports matches table', () => {
    expect(matches.id).toBeDefined();
    expect(matches.competitionId).toBeDefined();
    expect(matches.playedAt).toBeDefined();
  });

  it('exports matchTeams join table', () => {
    expect(matchTeams.id).toBeDefined();
    expect(matchTeams.matchId).toBeDefined();
    expect(matchTeams.teamEraId).toBeDefined();
  });

  it('exports matchEvents table with match-team + player + enum columns', () => {
    expect(matchEvents.id).toBeDefined();
    expect(matchEvents.matchId).toBeDefined();
    expect(matchEvents.actingMatchTeamId).toBeDefined();
    expect(matchEvents.consequenceMatchTeamId).toBeDefined();
    expect(matchEvents.actingPlayerId).toBeDefined();
    expect(matchEvents.consequencePlayerId).toBeDefined();
    expect(matchEvents.actionType).toBeDefined();
    expect(matchEvents.consequenceType).toBeDefined();
    expect(matchEvents.eventType).toBeDefined();
    expect(matchEvents.weatherType).toBeDefined();
    expect(matchEvents.secretObjective).toBeDefined();
    expect(matchEvents.inducementsFromTreasury).toBeDefined();
  });

  it('exports matchEventExternalIds table', () => {
    expect(matchEventExternalIds.id).toBeDefined();
    expect(matchEventExternalIds.matchEventId).toBeDefined();
    expect(matchEventExternalIds.externalSystemId).toBeDefined();
    expect(matchEventExternalIds.externalId).toBeDefined();
  });

  it('match_events has a nullable spp_value column', () => {
    const config = getTableConfig(matchEvents);
    const sppValue = config.columns.find((c) => c.name === 'spp_value');
    expect(sppValue).toBeDefined();
    expect(sppValue!.notNull).toBe(false);
  });

  it('match_teams has a non-null score column', () => {
    const config = getTableConfig(matchTeams);
    const score = config.columns.find((c) => c.name === 'score');
    expect(score).toBeDefined();
    expect(score!.notNull).toBe(true);
  });

  it('matches has a nullable winning_match_team_id referencing match_teams', () => {
    const config = getTableConfig(matches);
    const winner = config.columns.find(
      (c) => c.name === 'winning_match_team_id',
    );
    expect(winner).toBeDefined();
    expect(winner!.notNull).toBe(false);

    const fk = config.foreignKeys.find((foreignKey) =>
      foreignKey
        .reference()
        .columns.some((column) => column.name === 'winning_match_team_id'),
    );
    expect(fk).toBeDefined();
    const reference = fk!.reference();
    expect(reference.foreignTable).toBe(matchTeams);
    expect(reference.foreignColumns.map((column) => column.name)).toEqual([
      'id',
    ]);
  });

  it('exports sppAwardValues table', () => {
    expect(sppAwardValues.id).toBeDefined();
    expect(sppAwardValues.rulesSetId).toBeDefined();
    expect(sppAwardValues.raceId).toBeDefined();
    expect(sppAwardValues.actionType).toBeDefined();
    expect(sppAwardValues.sppValue).toBeDefined();
  });

  it('spp_award_values has a nullable race_id and non-null rules_set_id/action_type/spp_value', () => {
    const config = getTableConfig(sppAwardValues);
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('race_id')!.notNull).toBe(false);
    expect(byName.get('rules_set_id')!.notNull).toBe(true);
    expect(byName.get('action_type')!.notNull).toBe(true);
    expect(byName.get('spp_value')!.notNull).toBe(true);
  });

  it('spp_award_values is unique on (rules_set_id, race_id, action_type) with NULLS NOT DISTINCT', () => {
    const config = getTableConfig(sppAwardValues);
    const unique = config.uniqueConstraints[0];
    expect(unique).toBeDefined();
    expect(unique.columns.map((c) => c.name)).toEqual([
      'rules_set_id',
      'race_id',
      'action_type',
    ]);
    // NULLS NOT DISTINCT, not Postgres's NULLS DISTINCT default: without it two
    // baseline rows (both race_id NULL) could coexist for one rules set and
    // action type, and onConflictDoUpdate could never match a baseline row.
    expect(unique.nullsNotDistinct).toBe(true);
  });

  it('exports trophies table with recipient kind and nullable description', () => {
    expect(trophies.id).toBeDefined();
    expect(trophies.name).toBeDefined();
    expect(trophies.recipientKind).toBeDefined();
    expect(trophies.description).toBeDefined();
    expect(trophies.recipientKind.notNull).toBe(true);
    expect(trophies.description.notNull).toBe(false);
  });

  it('exports trophies.competition_group_id as a nullable column with no default', () => {
    // Nullable on purpose: a trophy is scoped EITHER to a competition group
    // or to a league, never to both, so a league-scoped trophy leaves this
    // column empty. The default is dropped for the same reason — an
    // unspecified scope must not silently become competition group 1.
    expect(trophies.competitionGroupId).toBeDefined();
    expect(trophies.competitionGroupId.notNull).toBe(false);
    expect(trophies.competitionGroupId.hasDefault).toBe(false);
  });

  it('exports trophies.league_id as a nullable integer column', () => {
    expect(trophies.leagueId).toBeDefined();
    expect(trophies.leagueId.notNull).toBe(false);
    expect(trophies.leagueId.hasDefault).toBe(false);
    expect(trophies.leagueId.getSQLType()).toBe('integer');
  });

  it('constrains trophies to exactly one of competition group and league', () => {
    const config = getTableConfig(trophies);
    const names = config.checks.map((c) => c.name);
    expect(names).toContain('trophies_group_or_league');
  });

  it('exports trophyExternalIds keyed on trophyId', () => {
    expect(trophyExternalIds.id).toBeDefined();
    expect(trophyExternalIds.trophyId).toBeDefined();
    expect(trophyExternalIds.externalSystemId).toBeDefined();
    expect(trophyExternalIds.externalId).toBeDefined();
  });

  it('trophy_awards is unique on (trophy_id, competition_id, team_era_id, player_id) with NULLS NOT DISTINCT', () => {
    const config = getTableConfig(trophyAwards);
    const unique = config.uniqueConstraints[0];
    expect(unique).toBeDefined();
    expect(unique.columns.map((c) => c.name)).toEqual([
      'trophy_id',
      'competition_id',
      'team_era_id',
      'player_id',
    ]);
    // NULLS NOT DISTINCT, not Postgres's NULLS DISTINCT default: a team award
    // always has player_id NULL, so the default semantics would treat every
    // team award as distinct from every other and let the same trophy be
    // recorded twice for one competition and team era.
    expect(unique.nullsNotDistinct).toBe(true);
  });

  it('exports trophyAwards link table with a nullable playerId', () => {
    expect(trophyAwards.id).toBeDefined();
    expect(trophyAwards.trophyId).toBeDefined();
    expect(trophyAwards.competitionId).toBeDefined();
    expect(trophyAwards.teamEraId).toBeDefined();
    expect(trophyAwards.playerId).toBeDefined();
    expect(trophyAwards.teamEraId.notNull).toBe(true);
    expect(trophyAwards.playerId.notNull).toBe(false);
  });

  it('exports the characteristic format enum', () => {
    expect(characteristicFormatEnum.enumName).toBe('characteristic_format');
    expect(characteristicFormatEnum.enumValues).toEqual([
      'absent',
      'bare',
      'plus',
    ]);
  });

  it('exports rules_sets characteristic format columns, not null with defaults', () => {
    const config = getTableConfig(rulesSets);
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    for (const name of [
      'move_format',
      'strength_format',
      'agility_format',
      'passing_format',
      'armour_format',
    ]) {
      expect(byName.get(name)!.notNull).toBe(true);
      // Defaulted on purpose: the BBL and TP importers create rules sets from
      // their own configs without saying anything about characteristics, and
      // a not-null column with no default would make those inserts fail.
      expect(byName.get(name)!.hasDefault).toBe(true);
    }
    expect(byName.get('move_format')!.default).toBe('bare');
    expect(byName.get('strength_format')!.default).toBe('bare');
    expect(byName.get('agility_format')!.default).toBe('bare');
    expect(byName.get('passing_format')!.default).toBe('absent');
    expect(byName.get('armour_format')!.default).toBe('bare');
  });

  it('exports positionRulesSets table', () => {
    expect(positionRulesSets.id).toBeDefined();
    expect(positionRulesSets.positionId).toBeDefined();
    expect(positionRulesSets.rulesSetId).toBeDefined();
    expect(positionRulesSets.move).toBeDefined();
    expect(positionRulesSets.strength).toBeDefined();
    expect(positionRulesSets.agility).toBeDefined();
    expect(positionRulesSets.passing).toBeDefined();
    expect(positionRulesSets.armour).toBeDefined();
    const config = getTableConfig(positionRulesSets);
    expect(config.name).toBe('position_rules_sets');
    expect(config.schema).toBe('game_data');
  });

  it('position_rules_sets has a nullable passing and non-null everything else', () => {
    const config = getTableConfig(positionRulesSets);
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    // Nullable on purpose: a rules set whose passing_format is 'absent' has
    // no Passing characteristic at all, so its rows carry no value.
    expect(byName.get('passing')!.notNull).toBe(false);
    for (const name of [
      'position_id',
      'rules_set_id',
      'move',
      'strength',
      'agility',
      'armour',
    ]) {
      expect(byName.get(name)!.notNull).toBe(true);
    }
  });

  it('position_rules_sets is unique on (position_id, rules_set_id)', () => {
    const config = getTableConfig(positionRulesSets);
    const unique = config.uniqueConstraints[0];
    expect(unique).toBeDefined();
    expect(unique.columns.map((c) => c.name)).toEqual([
      'position_id',
      'rules_set_id',
    ]);
  });
});
