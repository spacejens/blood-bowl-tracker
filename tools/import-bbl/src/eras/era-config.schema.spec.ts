import { describe, expect, it } from 'vitest';

import { eraConfigSchema, leaguesShellSchema } from './era-config.schema';

const VALID_ERA = {
  identity: { name: 'First era', rulesSets: ['CRP'] },
  dates: { startDate: '2011-09-09', autoAssignByDate: true },
  players: { autoAssignByPlayerId: true, firstPlayerId: 1 },
};

describe('leaguesShellSchema', () => {
  it('accepts a league with an eras array, leaving the eras untouched', () => {
    const parsed = leaguesShellSchema.parse([
      { leagueName: 'tLoEG', eras: [VALID_ERA] },
    ]);
    expect(parsed[0].leagueName).toBe('tLoEG');
    expect(parsed[0].eras).toHaveLength(1);
  });

  it('rejects a non-array and an empty array at the root', () => {
    expect(leaguesShellSchema.safeParse({}).success).toBe(false);
    expect(leaguesShellSchema.safeParse([]).success).toBe(false);
    expect(leaguesShellSchema.safeParse([]).error?.issues[0].path).toEqual([]);
  });

  it('rejects a blank leagueName at its own path', () => {
    const result = leaguesShellSchema.safeParse([
      { leagueName: '', eras: [VALID_ERA] },
    ]);
    expect(result.error?.issues[0].path).toEqual([0, 'leagueName']);
  });

  it('rejects a missing or empty eras array at its own path', () => {
    const result = leaguesShellSchema.safeParse([
      { leagueName: 'tLoEG', eras: [] },
    ]);
    expect(result.error?.issues[0].path).toEqual([0, 'eras']);
    expect(result.error?.issues[0].message).toBe(
      'must be a non-empty array of eras.',
    );
  });
});

describe('eraConfigSchema', () => {
  it('accepts a minimal era', () => {
    const parsed = eraConfigSchema.parse(VALID_ERA);
    expect(parsed.identity.name).toBe('First era');
    expect(parsed.dates.autoAssignByDate).toBe(true);
    expect(parsed.competitions).toBeUndefined();
    expect(parsed.teams).toBeUndefined();
    expect(parsed.matches).toBeUndefined();
    expect(parsed.positions).toBeUndefined();
  });

  it('rejects a non-object era at the root', () => {
    const result = eraConfigSchema.safeParse('nope');
    expect(result.error?.issues[0].path).toEqual([]);
    expect(result.error?.issues[0].message).toBe('must be an object.');
  });

  it('rejects a blank identity.name', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      identity: { name: ' ', rulesSets: ['CRP'] },
    });
    expect(result.error?.issues[0].path).toEqual(['identity', 'name']);
  });

  it('rejects an empty identity.rulesSets', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      identity: { name: 'E', rulesSets: [] },
    });
    expect(result.error?.issues[0].path).toEqual(['identity', 'rulesSets']);
    expect(result.error?.issues[0].message).toBe(
      'must be a non-empty array of non-empty strings.',
    );
  });

  it('rejects a bad dates.startDate and a bad dates.endDate', () => {
    expect(
      eraConfigSchema.safeParse({
        ...VALID_ERA,
        dates: { startDate: '2011-02-30', autoAssignByDate: true },
      }).error?.issues[0].path,
    ).toEqual(['dates', 'startDate']);
    expect(
      eraConfigSchema.safeParse({
        ...VALID_ERA,
        dates: {
          startDate: '2011-09-09',
          endDate: 'later',
          autoAssignByDate: true,
        },
      }).error?.issues[0].path,
    ).toEqual(['dates', 'endDate']);
  });

  it('rejects a non-boolean dates.autoAssignByDate', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      dates: { startDate: '2011-09-09', autoAssignByDate: 'yes' },
    });
    expect(result.error?.issues[0].path).toEqual(['dates', 'autoAssignByDate']);
    expect(result.error?.issues[0].message).toBe('must be a boolean.');
  });

  it('reports players.autoAssignByPlayerId before any other players field', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      players: { autoAssignByPlayerId: 'yes', firstPlayerId: 'x' },
    });
    expect(result.error?.issues[0].path).toEqual([
      'players',
      'autoAssignByPlayerId',
    ]);
  });

  it('requires players.firstPlayerId when autoAssignByPlayerId is true', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      players: { autoAssignByPlayerId: true },
    });
    expect(result.error?.issues[0].path).toEqual(['players', 'firstPlayerId']);
    expect(result.error?.issues[0].message).toBe('must be a positive integer.');
  });

  it('rejects a non-numeric firstPlayerId with the "when present" message', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      players: { autoAssignByPlayerId: true, firstPlayerId: 'x' },
    });
    expect(result.error?.issues[0].path).toEqual(['players', 'firstPlayerId']);
    expect(result.error?.issues[0].message).toBe(
      'must be a positive integer when present.',
    );
  });

  it('rejects a non-numeric lastPlayerId with the "when present" message', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      players: {
        autoAssignByPlayerId: true,
        firstPlayerId: 1,
        lastPlayerId: 'x',
      },
    });
    expect(result.error?.issues[0].path).toEqual(['players', 'lastPlayerId']);
    expect(result.error?.issues[0].message).toBe(
      'must be a positive integer when present.',
    );
  });

  it('allows no player ids at all when autoAssignByPlayerId is false', () => {
    const parsed = eraConfigSchema.parse({
      ...VALID_ERA,
      players: { autoAssignByPlayerId: false },
    });
    expect(parsed.players.firstPlayerId).toBeUndefined();
  });

  it('rejects a lastPlayerId with no firstPlayerId', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      players: { autoAssignByPlayerId: false, lastPlayerId: 10 },
    });
    expect(result.error?.issues[0].path).toEqual(['players', 'lastPlayerId']);
    expect(result.error?.issues[0].message).toBe(
      'requires firstPlayerId to be set.',
    );
  });

  it('rejects firstPlayerId greater than lastPlayerId', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      players: {
        autoAssignByPlayerId: true,
        firstPlayerId: 10,
        lastPlayerId: 5,
      },
    });
    expect(result.error?.issues[0].path).toEqual(['players', 'firstPlayerId']);
    expect(result.error?.issues[0].message).toBe(
      'must be less than or equal to lastPlayerId.',
    );
  });

  it('rejects a non-positive-integer entry in playerIdOverrides, naming its index', () => {
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      players: {
        autoAssignByPlayerId: true,
        firstPlayerId: 1,
        playerIdOverrides: [1, 0],
      },
    });
    expect(result.error?.issues[0].path).toEqual([
      'players',
      'playerIdOverrides',
      1,
    ]);
  });

  it('accepts competitions.overrides with dates and rejects a bad type', () => {
    const parsed = eraConfigSchema.parse({
      ...VALID_ERA,
      competitions: {
        overrides: [
          {
            bblId: '35',
            type: 'season',
            startDate: '2011-09-09',
            endDate: '2011-12-18',
          },
        ],
      },
    });
    expect(parsed.competitions?.overrides?.[0].type).toBe('season');

    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      competitions: { overrides: [{ bblId: '35', type: 'tournament' }] },
    });
    expect(result.error?.issues[0].path).toEqual([
      'competitions',
      'overrides',
      0,
      'type',
    ]);
    expect(result.error?.issues[0].message).toBe('must be "season" or "cup".');
  });

  it('rejects a competitions.override endDate with no startDate, and an endDate before startDate', () => {
    expect(
      eraConfigSchema.safeParse({
        ...VALID_ERA,
        competitions: {
          overrides: [{ bblId: '1', type: 'cup', endDate: '2011-12-18' }],
        },
      }).error?.issues[0].message,
    ).toBe('requires startDate to also be set.');
    expect(
      eraConfigSchema.safeParse({
        ...VALID_ERA,
        competitions: {
          overrides: [
            {
              bblId: '1',
              type: 'cup',
              startDate: '2011-12-18',
              endDate: '2011-09-09',
            },
          ],
        },
      }).error?.issues[0].message,
    ).toBe('must not be before startDate.');
  });

  it('accepts teams.teamCodeOverrides and rejects a blank entry, naming its index', () => {
    expect(
      eraConfigSchema.parse({
        ...VALID_ERA,
        teams: { teamCodeOverrides: ['ABC'] },
      }).teams?.teamCodeOverrides,
    ).toEqual(['ABC']);
    expect(
      eraConfigSchema.safeParse({
        ...VALID_ERA,
        teams: { teamCodeOverrides: [''] },
      }).error?.issues[0].path,
    ).toEqual(['teams', 'teamCodeOverrides', 0]);
  });

  it('carries matches lists through untouched but requires arrays', () => {
    const parsed = eraConfigSchema.parse({
      ...VALID_ERA,
      matches: {
        merges: [['1', '2']],
        categoryOverrides: [{ matchId: '3', category: 'league' }],
        resultOverrides: [{ matchId: '4', winnerTeamCode: 'ABC' }],
      },
    });
    expect(parsed.matches?.merges).toHaveLength(1);
    expect(parsed.matches?.categoryOverrides).toHaveLength(1);
    expect(parsed.matches?.resultOverrides).toHaveLength(1);
    expect(
      eraConfigSchema.safeParse({ ...VALID_ERA, matches: { merges: 'no' } })
        .error?.issues[0].path,
    ).toEqual(['matches', 'merges']);
  });

  it('accepts positions and rejects a bad available flag', () => {
    const parsed = eraConfigSchema.parse({
      ...VALID_ERA,
      positions: [{ positionId: '7', raceId: '3', available: false }],
    });
    expect(parsed.positions?.[0].available).toBe(false);
    const result = eraConfigSchema.safeParse({
      ...VALID_ERA,
      positions: [{ positionId: '7', raceId: '3', available: 'no' }],
    });
    expect(result.error?.issues[0].path).toEqual(['positions', 0, 'available']);
  });
});
