import { describe, expect, it } from 'vitest';

import { ManualDataFileSchema } from './manual-data-file.schema';

const parse = (repair: unknown) =>
  ManualDataFileSchema.safeParse({ lastingInjuryRepairs: [repair] });

describe('ManualDataFileSchema lastingInjuryRepairs', () => {
  it('defaults to no repairs', () => {
    expect(ManualDataFileSchema.parse({}).lastingInjuryRepairs).toEqual([]);
  });

  it('accepts a TP player', () => {
    const result = parse({ player: { system: 'tourplay.net', id: '586220' } });

    expect(result.success).toBe(true);
    expect(result.data?.lastingInjuryRepairs).toEqual([
      { player: { system: 'tourplay.net', id: '586220' } },
    ]);
  });

  it('refuses a player of another system', () => {
    expect(
      parse({ player: { system: 'tloeg.bbleague.se', id: '47' } }).success,
    ).toBe(false);
  });

  it('refuses an empty id', () => {
    expect(parse({ player: { system: 'tourplay.net', id: '' } }).success).toBe(
      false,
    );
  });

  it('refuses an entry carrying counts', () => {
    expect(
      parse({
        player: { system: 'tourplay.net', id: '586220' },
        armourReductionCount: 1,
      }).success,
    ).toBe(false);
  });
});
