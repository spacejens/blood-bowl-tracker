import { describe, expect, it } from 'vitest';

import {
  ImportTpCompetitionSchema,
  TpCompetitionImportResultSchema,
} from './tp-competition';

const input = {
  tournament: { id: 18442, name: 'Säsong 30' },
  playedDates: ['2026-01-10T00:00:00.000Z'],
  era: 'Fourth era',
  participantRosterIds: [163386, 179769],
  awards: [
    { id: 24112, awardType: 1, rosterId: 179769 },
    { id: 24113, awardType: 100, name: 'Best Stunty', rosterId: 163386 },
  ],
  externalSystemName: 'TP',
};

describe('ImportTpCompetitionSchema', () => {
  it('accepts a competition, turning its ISO played dates into dates', () => {
    const parsed = ImportTpCompetitionSchema.parse(input);

    expect(parsed.playedDates).toEqual([new Date('2026-01-10T00:00:00.000Z')]);
    expect(parsed.awards).toEqual(input.awards);
    expect(parsed.participantRosterIds).toEqual([163386, 179769]);
  });

  it('rejects an empty era or external system name', () => {
    expect(
      ImportTpCompetitionSchema.safeParse({ ...input, era: '' }).success,
    ).toBe(false);
    expect(
      ImportTpCompetitionSchema.safeParse({ ...input, externalSystemName: '' })
        .success,
    ).toBe(false);
  });

  it('rejects an award with no roster id', () => {
    expect(
      ImportTpCompetitionSchema.safeParse({
        ...input,
        awards: [{ id: 1, awardType: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe('TpCompetitionImportResultSchema', () => {
  it('requires one result per stage', () => {
    const one = { success: true, imported: 1, errors: [] };
    expect(
      TpCompetitionImportResultSchema.safeParse({
        competition: one,
        participation: one,
        trophyAwards: one,
      }).success,
    ).toBe(true);
    expect(
      TpCompetitionImportResultSchema.safeParse({
        competition: one,
        participation: one,
      }).success,
    ).toBe(false);
  });
});
