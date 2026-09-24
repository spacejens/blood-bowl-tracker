import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PhaseFixturesParserService } from './phase-fixtures-parser.service';

/** One fixture as TP's phase response lists it (extra fields included). */
function fixture(overrides: Record<string, unknown> = {}) {
  return {
    matchId: 662796,
    state: 260566971,
    round: 2,
    order: 1,
    rest: false,
    scheduledDate: '2026-06-13T14:00:00+00:00',
    scoreResume: {
      totalScoreLocal: 1,
      totalScoreVisitor: 2,
      startInstant: '2026-06-13T14:23:37+00:00',
      winner: 'Visitor',
    },
    rosterLocal: { id: 163386, teamName: 'Ruddalen Rotters' },
    rosterVisitor: { id: 179769, teamName: 'Skärhamn City Stinkers' },
    ...overrides,
  };
}

describe('PhaseFixturesParserService', () => {
  let service: PhaseFixturesParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PhaseFixturesParserService],
    }).compile();
    service = moduleRef.get(PhaseFixturesParserService);
  });

  it('extracts the current round, every round number, and each fixture', () => {
    expect(
      service.parse({
        rounds: [
          { roundNumber: 1, roundProgresion: { isCompleted: true } },
          { roundNumber: 2 },
        ],
        currentRound: 2,
        matches: [fixture()],
      }),
    ).toEqual({
      currentRound: 2,
      roundNumbers: [1, 2],
      fixtures: [
        {
          id: 662796,
          round: 2,
          homeTeamTpId: 163386,
          awayTeamTpId: 179769,
          playedDate: new Date('2026-06-13T14:23:37+00:00'),
          winner: 'away',
        },
      ],
    });
  });

  it('dates a fixture by its scheduled date without a start instant, and leaves an unscheduled one undated', () => {
    const { fixtures } = service.parse({
      matches: [
        fixture({ matchId: 1, scoreResume: null }),
        fixture({ matchId: 2, scoreResume: null, scheduledDate: null }),
      ],
    });
    expect(fixtures[0].playedDate).toEqual(
      new Date('2026-06-13T14:00:00+00:00'),
    );
    expect(fixtures[1].playedDate).toBeUndefined();
  });

  it("maps TP's Local and Draw winners, and no recorded winner to undefined", () => {
    const { fixtures } = service.parse({
      matches: [
        fixture({ matchId: 1, scoreResume: { winner: 'Local' } }),
        fixture({ matchId: 2, scoreResume: { winner: 'Draw' } }),
        fixture({ matchId: 3, scoreResume: {} }),
      ],
    });
    expect(fixtures.map((f) => f.winner)).toEqual(['home', 'draw', undefined]);
  });

  it('skips a fixture missing either roster (a bye is not a match)', () => {
    const { fixtures } = service.parse({
      matches: [
        fixture({ matchId: 1, rosterVisitor: null }),
        fixture({ matchId: 2 }),
      ],
    });
    expect(fixtures.map((f) => f.id)).toEqual([2]);
  });

  it('treats absent rounds, matches and current round as empty', () => {
    expect(service.parse({})).toEqual({
      currentRound: undefined,
      roundNumbers: [],
      fixtures: [],
    });
  });

  it('throws naming the field on a shape mismatch', () => {
    expect(() =>
      service.parse({ matches: [fixture({ matchId: 'x' })] }),
    ).toThrow(/matches\.0\.matchId/);
  });

  it('throws on a date string that does not parse', () => {
    expect(() =>
      service.parse({
        matches: [fixture({ scoreResume: { startInstant: 'not a date' } })],
      }),
    ).toThrow(/not a date/);
  });
});
