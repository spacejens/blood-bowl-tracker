import { describe, expect, it } from 'vitest';

import { MatchParserService } from './match-parser.service';

const service = new MatchParserService();

/**
 * A minimal valid match body. `round`, `group.phase.roundName`,
 * `inscriptionLocal.roster.id` and `inscriptionVisitor.roster.id` are all
 * required, so every valid body includes them; override to model each case.
 */
function matchBody(overrides: Record<string, unknown> = {}) {
  return {
    matchId: 42,
    round: 3,
    group: { phase: { roundName: 'ROUND' } },
    createdInstant: '2021-04-01T09:00:00Z',
    inscriptionLocal: { roster: { id: 10 } },
    inscriptionVisitor: { roster: { id: 20 } },
    ...overrides,
  };
}

describe('MatchParserService', () => {
  it('maps matchId to id, prefers scoreResume.startInstant, builds name, and parses home/away roster ids', () => {
    const result = service.parse(
      matchBody({
        matchId: 566088,
        scheduledDate: '2021-05-15T18:00:00Z',
        scoreResume: { startInstant: '2021-05-15T18:00:03Z' },
        // Unrelated fields that must be ignored, not rejected:
        state: 3,
        matchEvents: [],
      }),
    );
    expect(result).toEqual({
      id: 566088,
      playedDate: new Date('2021-05-15T18:00:03Z'),
      name: 'Round 3',
      homeTeamTpId: 10,
      awayTeamTpId: 20,
    });
  });

  it('parses distinct home and away roster ids from inscriptionLocal/inscriptionVisitor', () => {
    const result = service.parse(
      matchBody({
        inscriptionLocal: { roster: { id: 777 } },
        inscriptionVisitor: { roster: { id: 888 } },
      }),
    );
    expect(result.homeTeamTpId).toBe(777);
    expect(result.awayTeamTpId).toBe(888);
  });

  it('title-cases an all-caps roundName ("ROUND" + 3 -> "Round 3")', () => {
    expect(service.parse(matchBody()).name).toBe('Round 3');
  });

  it('title-cases a "DAY" roundName ("DAY" + 2 -> "Day 2")', () => {
    const result = service.parse(
      matchBody({ round: 2, group: { phase: { roundName: 'DAY' } } }),
    );
    expect(result.name).toBe('Day 2');
  });

  it('prefers scoreResume.startInstant over createdInstant when scheduledDate is absent', () => {
    const result = service.parse(
      matchBody({ scoreResume: { startInstant: '2021-04-01T09:00:00Z' } }),
    );
    expect(result.playedDate).toEqual(new Date('2021-04-01T09:00:00Z'));
  });

  it('falls back to scheduledDate when scoreResume is absent entirely', () => {
    const result = service.parse(
      matchBody({ scheduledDate: '2021-05-15T18:00:00Z' }),
    );
    expect(result.playedDate).toEqual(new Date('2021-05-15T18:00:00Z'));
  });

  it('falls back to scheduledDate when scoreResume.startInstant is null', () => {
    const result = service.parse(
      matchBody({
        scheduledDate: '2021-05-15T18:00:00Z',
        scoreResume: { startInstant: null },
      }),
    );
    expect(result.playedDate).toEqual(new Date('2021-05-15T18:00:00Z'));
  });

  it('falls back to createdInstant when scoreResume.startInstant and scheduledDate are both absent', () => {
    const result = service.parse(
      matchBody({ createdInstant: '2021-04-01T09:00:00Z' }),
    );
    expect(result.playedDate).toEqual(new Date('2021-04-01T09:00:00Z'));
  });

  it('falls back to createdInstant when scoreResume.startInstant is null and scheduledDate is null', () => {
    const result = service.parse(
      matchBody({
        scheduledDate: null,
        scoreResume: { startInstant: null },
        createdInstant: '2021-04-01T09:00:00Z',
      }),
    );
    expect(result.playedDate).toEqual(new Date('2021-04-01T09:00:00Z'));
  });

  it('throws naming the field when matchId is missing', () => {
    expect(() =>
      service.parse({
        round: 3,
        group: { phase: { roundName: 'ROUND' } },
        createdInstant: '2021-04-01T09:00:00Z',
        inscriptionLocal: { roster: { id: 10 } },
        inscriptionVisitor: { roster: { id: 20 } },
      }),
    ).toThrow(/matchId/);
  });

  it('throws naming the field when matchId is not a number', () => {
    expect(() => service.parse(matchBody({ matchId: 'nope' }))).toThrow(
      /matchId/,
    );
  });

  it('throws naming the field when round is missing', () => {
    expect(() =>
      service.parse({
        matchId: 1,
        group: { phase: { roundName: 'ROUND' } },
        createdInstant: '2021-04-01T09:00:00Z',
        inscriptionLocal: { roster: { id: 10 } },
        inscriptionVisitor: { roster: { id: 20 } },
      }),
    ).toThrow(/round/);
  });

  it('throws naming the field when group.phase.roundName is missing', () => {
    expect(() =>
      service.parse({
        matchId: 1,
        round: 3,
        group: { phase: {} },
        createdInstant: '2021-04-01T09:00:00Z',
        inscriptionLocal: { roster: { id: 10 } },
        inscriptionVisitor: { roster: { id: 20 } },
      }),
    ).toThrow(/roundName/);
  });

  it('throws naming the field when createdInstant is missing', () => {
    // createdInstant is the last-resort date source, so it must always exist.
    expect(() =>
      service.parse({
        matchId: 1,
        round: 3,
        group: { phase: { roundName: 'ROUND' } },
        scheduledDate: '2021-05-15T18:00:00Z',
        inscriptionLocal: { roster: { id: 10 } },
        inscriptionVisitor: { roster: { id: 20 } },
      }),
    ).toThrow(/createdInstant/);
  });

  it('throws naming the field when inscriptionLocal.roster.id is missing', () => {
    expect(() =>
      service.parse(matchBody({ inscriptionLocal: { roster: {} } })),
    ).toThrow(/inscriptionLocal/);
  });

  it('throws naming the field when inscriptionVisitor.roster.id is missing', () => {
    expect(() =>
      service.parse(matchBody({ inscriptionVisitor: { roster: {} } })),
    ).toThrow(/inscriptionVisitor/);
  });

  it('throws naming the field when inscriptionLocal.roster.id is not a number', () => {
    expect(() =>
      service.parse(matchBody({ inscriptionLocal: { roster: { id: 'x' } } })),
    ).toThrow(/inscriptionLocal/);
  });

  it('throws when the resolved date is not a valid date string', () => {
    expect(() =>
      service.parse(matchBody({ createdInstant: 'not-a-date' })),
    ).toThrow(/date/);
  });

  it('throws when the body is not an object', () => {
    expect(() => service.parse(null)).toThrow();
    expect(() => service.parse('not json')).toThrow();
  });
});
