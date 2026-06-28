import { describe, it, expect } from 'vitest';
import { parseBblExport } from './bbl-parser';

const validJson = JSON.stringify({
  teams: [{ id: 't1', name: 'Green Mashers', race: 'Orc', coachName: 'Gruk' }],
  players: [{ id: 'p1', name: 'Slugger', teamId: 't1', position: 'Blitzer' }],
  matches: [
    {
      id: 'm1',
      homeTeamId: 't1',
      awayTeamId: 't2',
      playedAt: '2026-01-15T14:00:00Z',
      events: [{ type: 'touchdown', teamId: 't1', playerId: 'p1' }],
    },
  ],
});

describe('parseBblExport', () => {
  it('parses valid BBL export JSON', () => {
    const result = parseBblExport(validJson);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].name).toBe('Green Mashers');
    expect(result.players).toHaveLength(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].events).toHaveLength(1);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseBblExport('not json')).toThrow();
  });

  it('throws when required fields are missing', () => {
    expect(() => parseBblExport(JSON.stringify({ teams: [] }))).toThrow(
      'BBL export must contain teams, players, and matches arrays',
    );
  });
});
