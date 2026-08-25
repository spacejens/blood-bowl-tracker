import { describe, expect, it } from 'vitest';

import {
  matchCategoryOverrideSchema,
  matchMergePairSchema,
  matchResultOverrideSchema,
} from './match-config.schema';

describe('matchMergePairSchema', () => {
  it('accepts two non-empty match ids', () => {
    expect(matchMergePairSchema.parse(['1', '2'])).toEqual(['1', '2']);
  });

  it('rejects anything that is not a 2-element array', () => {
    for (const value of ['1', ['1'], ['1', '2', '3'], {}]) {
      const result = matchMergePairSchema.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'must be a 2-element array of match ids.',
      );
    }
  });

  it('rejects a pair with a blank or non-string id', () => {
    const result = matchMergePairSchema.safeParse(['1', ' ']);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'must contain two non-empty string match ids.',
    );
    expect(matchMergePairSchema.safeParse(['1', 2]).success).toBe(false);
  });

  it('reports every issue at the root, so the location prefix stands alone', () => {
    expect(matchMergePairSchema.safeParse('x').error?.issues[0].path).toEqual(
      [],
    );
  });
});

describe('matchCategoryOverrideSchema', () => {
  it('accepts a known category', () => {
    expect(
      matchCategoryOverrideSchema.parse({ matchId: '9', category: 'normal' }),
    ).toEqual({ matchId: '9', category: 'normal' });
  });

  it('rejects a non-object', () => {
    const result = matchCategoryOverrideSchema.safeParse('nope');
    expect(result.error?.issues[0].path).toEqual([]);
    expect(result.error?.issues[0].message).toBe(
      'must be an object of the form { matchId, category }.',
    );
  });

  it('rejects a blank matchId', () => {
    const result = matchCategoryOverrideSchema.safeParse({
      matchId: ' ',
      category: 'normal',
    });
    expect(result.error?.issues[0].path).toEqual(['matchId']);
    expect(result.error?.issues[0].message).toBe('must be a non-empty string.');
  });

  it('rejects an unknown category and lists the allowed ones', () => {
    const result = matchCategoryOverrideSchema.safeParse({
      matchId: '9',
      category: 'brunch',
    });
    expect(result.error?.issues[0].path).toEqual(['category']);
    expect(result.error?.issues[0].message).toMatch(/^must be one of: /);
  });
});

describe('matchResultOverrideSchema', () => {
  it('accepts a winner team code', () => {
    expect(
      matchResultOverrideSchema.parse({ matchId: '9', winnerTeamCode: 'ABC' }),
    ).toEqual({ matchId: '9', winnerTeamCode: 'ABC' });
  });

  it('rejects a non-object', () => {
    const result = matchResultOverrideSchema.safeParse(3);
    expect(result.error?.issues[0].path).toEqual([]);
    expect(result.error?.issues[0].message).toBe(
      'must be an object of the form { matchId, winnerTeamCode }.',
    );
  });

  it('rejects a blank winnerTeamCode', () => {
    const result = matchResultOverrideSchema.safeParse({
      matchId: '9',
      winnerTeamCode: '',
    });
    expect(result.error?.issues[0].path).toEqual(['winnerTeamCode']);
    expect(result.error?.issues[0].message).toBe(
      'must be a non-empty string: a BBL team code, or "draw".',
    );
  });
});
