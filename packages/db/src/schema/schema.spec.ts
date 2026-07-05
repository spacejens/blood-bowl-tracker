import { describe, it, expect } from 'vitest';
import {
  coaches,
  competitionTeams,
  competitions,
  coachExternalIds,
  eras,
  externalSystems,
  leagues,
  matchEvents,
  matchTeams,
  matches,
  players,
  positions,
  raceRulesSets,
  races,
  rulesSets,
  teamEras,
  teams,
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

  it('exports raceRulesSets join table', () => {
    expect(raceRulesSets.id).toBeDefined();
    expect(raceRulesSets.raceId).toBeDefined();
    expect(raceRulesSets.rulesSetId).toBeDefined();
  });

  it('exports leagues table', () => {
    expect(leagues.id).toBeDefined();
    expect(leagues.name).toBeDefined();
  });

  it('exports eras table', () => {
    expect(eras.id).toBeDefined();
    expect(eras.name).toBeDefined();
    expect(eras.leagueId).toBeDefined();
    expect(eras.rulesSetId).toBeDefined();
    expect(eras.externalSystemId).toBeDefined();
    expect(eras.startDate).toBeDefined();
    expect(eras.endDate).toBeDefined();
  });

  it('exports externalSystems table', () => {
    expect(externalSystems.id).toBeDefined();
    expect(externalSystems.name).toBeDefined();
  });

  it('exports coachExternalIds join table', () => {
    expect(coachExternalIds.id).toBeDefined();
    expect(coachExternalIds.coachId).toBeDefined();
    expect(coachExternalIds.externalSystemId).toBeDefined();
    expect(coachExternalIds.externalId).toBeDefined();
  });

  it('exports competitions table with type enum', () => {
    expect(competitions.id).toBeDefined();
    expect(competitions.name).toBeDefined();
    expect(competitions.type).toBeDefined();
    expect(competitions.eraId).toBeDefined();
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
    expect(positions.raceId).toBeDefined();
  });

  it('exports players table with FK columns', () => {
    expect(players.id).toBeDefined();
    expect(players.name).toBeDefined();
    expect(players.teamEraId).toBeDefined();
    expect(players.positionId).toBeDefined();
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

  it('exports matchEvents table with optional participant columns', () => {
    expect(matchEvents.id).toBeDefined();
    expect(matchEvents.matchId).toBeDefined();
    expect(matchEvents.actingTeamEraId).toBeDefined();
    expect(matchEvents.consequenceTeamEraId).toBeDefined();
    expect(matchEvents.actingPlayerId).toBeDefined();
    expect(matchEvents.consequencePlayerId).toBeDefined();
  });
});
