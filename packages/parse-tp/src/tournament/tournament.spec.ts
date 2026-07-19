import { describe, expect, it } from 'vitest';

import { parseTournament } from './tournament';

describe('parseTournament', () => {
  it('extracts id, name and ruleSet from a valid tournament body', () => {
    const result = parseTournament({
      id: 12345,
      name: 'tLoEGBBL Chaos Cup 8',
      ruleSet: 25,
      // Unrelated fields that must be ignored, not rejected:
      categories: [{ id: 1 }],
      phases: [],
      scoringRules: { win: 3 },
    });
    expect(result).toEqual({
      id: 12345,
      name: 'tLoEGBBL Chaos Cup 8',
      ruleSet: 25,
    });
  });

  it('throws naming the field when id is missing', () => {
    expect(() => parseTournament({ name: 'X', ruleSet: 25 })).toThrow(/id/);
  });

  it('throws naming the field when id is not a number', () => {
    expect(() =>
      parseTournament({ id: 'nope', name: 'X', ruleSet: 25 }),
    ).toThrow(/id/);
  });

  it('throws naming the field when name is missing', () => {
    expect(() => parseTournament({ id: 1, ruleSet: 25 })).toThrow(/name/);
  });

  it('throws naming the field when name is not a string', () => {
    expect(() => parseTournament({ id: 1, name: 42, ruleSet: 25 })).toThrow(
      /name/,
    );
  });

  it('throws naming the field when ruleSet is missing', () => {
    expect(() => parseTournament({ id: 1, name: 'X' })).toThrow(/ruleSet/);
  });

  it('throws naming the field when ruleSet is not a number', () => {
    expect(() =>
      parseTournament({ id: 1, name: 'X', ruleSet: 'twenty' }),
    ).toThrow(/ruleSet/);
  });

  it('throws when the body is not an object', () => {
    expect(() => parseTournament(null)).toThrow();
    expect(() => parseTournament('not json')).toThrow();
  });
});
