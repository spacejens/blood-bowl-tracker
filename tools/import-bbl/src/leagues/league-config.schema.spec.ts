import { describe, expect, it } from 'vitest';

import { leagueEntriesSchema } from './league-config.schema';

describe('leagueEntriesSchema', () => {
  it('accepts a list of leagues and keeps their order', () => {
    const parsed = leagueEntriesSchema.parse([
      { leagueName: 'tLoEG' },
      { leagueName: 'Second' },
    ]);
    expect(parsed.map((entry) => entry.leagueName)).toEqual([
      'tLoEG',
      'Second',
    ]);
  });

  it('ignores extra keys such as eras', () => {
    const parsed = leagueEntriesSchema.parse([
      { leagueName: 'tLoEG', eras: [{ anything: true }] },
    ]);
    expect(parsed[0].leagueName).toBe('tLoEG');
  });

  it('rejects a non-array with a root-level issue', () => {
    const result = leagueEntriesSchema.safeParse('tLoEG');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([]);
    expect(result.error?.issues[0].message).toBe(
      'must be a non-empty array of leagues.',
    );
  });

  it('rejects an empty array with a root-level issue', () => {
    const result = leagueEntriesSchema.safeParse([]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([]);
  });

  it('rejects a non-object entry, pointing at its index', () => {
    const result = leagueEntriesSchema.safeParse(['tLoEG']);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([0]);
    expect(result.error?.issues[0].message).toBe('must be an object.');
  });

  it('rejects a blank leagueName, pointing at the field', () => {
    const result = leagueEntriesSchema.safeParse([{ leagueName: '   ' }]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([0, 'leagueName']);
    expect(result.error?.issues[0].message).toBe('must be a non-empty string.');
  });

  it('rejects a missing leagueName', () => {
    expect(leagueEntriesSchema.safeParse([{}]).success).toBe(false);
  });
});
