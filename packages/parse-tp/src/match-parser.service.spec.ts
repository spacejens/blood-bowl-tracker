import { describe, expect, it } from 'vitest';

import { MatchParserService } from './match-parser.service';

describe('MatchParserService', () => {
  const service = new MatchParserService();

  it('maps matchId to id and scheduledDate to a Date when present', () => {
    const result = service.parse({
      matchId: 566088,
      scheduledDate: '2021-05-15T18:00:00Z',
      createdInstant: '2021-04-01T09:00:00Z',
      // Unrelated fields that must be ignored, not rejected:
      state: 3,
      round: 1,
      matchEvents: [],
    });
    expect(result).toEqual({
      id: 566088,
      scheduledDate: new Date('2021-05-15T18:00:00Z'),
    });
  });

  it('falls back to createdInstant when scheduledDate is null', () => {
    const result = service.parse({
      matchId: 42,
      scheduledDate: null,
      createdInstant: '2021-04-01T09:00:00Z',
    });
    expect(result).toEqual({
      id: 42,
      scheduledDate: new Date('2021-04-01T09:00:00Z'),
    });
  });

  it('falls back to createdInstant when scheduledDate is absent', () => {
    const result = service.parse({
      matchId: 42,
      createdInstant: '2021-04-01T09:00:00Z',
    });
    expect(result.scheduledDate).toEqual(new Date('2021-04-01T09:00:00Z'));
  });

  it('throws naming the field when matchId is missing', () => {
    expect(() =>
      service.parse({ createdInstant: '2021-04-01T09:00:00Z' }),
    ).toThrow(/matchId/);
  });

  it('throws naming the field when matchId is not a number', () => {
    expect(() =>
      service.parse({
        matchId: 'nope',
        createdInstant: '2021-04-01T09:00:00Z',
      }),
    ).toThrow(/matchId/);
  });

  it('throws naming the field when createdInstant is missing', () => {
    // createdInstant is the fallback source, so it must always exist.
    expect(() =>
      service.parse({ matchId: 1, scheduledDate: '2021-05-15T18:00:00Z' }),
    ).toThrow(/createdInstant/);
  });

  it('throws when the resolved date is not a valid date string', () => {
    expect(() =>
      service.parse({ matchId: 1, createdInstant: 'not-a-date' }),
    ).toThrow(/date/);
  });

  it('throws when the body is not an object', () => {
    expect(() => service.parse(null)).toThrow();
    expect(() => service.parse('not json')).toThrow();
  });
});
