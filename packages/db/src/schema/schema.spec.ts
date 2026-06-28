import { describe, it, expect } from 'vitest';
import { teams, players, matches, matchEvents } from './index';

describe('schema', () => {
  it('exports teams table with required columns', () => {
    expect(teams.id).toBeDefined();
    expect(teams.name).toBeDefined();
    expect(teams.race).toBeDefined();
    expect(teams.coach).toBeDefined();
  });

  it('exports players table with required columns', () => {
    expect(players.id).toBeDefined();
    expect(players.name).toBeDefined();
    expect(players.teamId).toBeDefined();
    expect(players.position).toBeDefined();
  });

  it('exports matches table with required columns', () => {
    expect(matches.id).toBeDefined();
    expect(matches.homeTeamId).toBeDefined();
    expect(matches.awayTeamId).toBeDefined();
    expect(matches.playedAt).toBeDefined();
  });

  it('exports matchEvents table with required columns', () => {
    expect(matchEvents.id).toBeDefined();
    expect(matchEvents.matchId).toBeDefined();
    expect(matchEvents.type).toBeDefined();
    expect(matchEvents.teamId).toBeDefined();
  });
});
