import { describe, expect, it } from 'vitest';

import {
  PLAYER_CHARACTERISTIC_INCREASE_KEYS,
  PLAYER_LASTING_INJURY_KEYS,
  PlayerSchema,
  SPP_CAREER_COUNT_KEYS,
  SyncLastingInjuryHistoryResultSchema,
  SyncLastingInjuryHistorySchema,
  SyncReportedSppAdjustmentsSchema,
  SyncScrapedSppAdjustmentsSchema,
  SyncSppAdjustmentsResultSchema,
  UpsertPlayerSchema,
} from './player';

describe('player schemas', () => {
  const noLastingInjuries = {
    missNextGame: false,
    nigglingInjuryCount: 0,
    moveReductionCount: 0,
    strengthReductionCount: 0,
    agilityReductionCount: 0,
    passingReductionCount: 0,
    armourReductionCount: 0,
  };

  const noIncreases = {
    moveIncreaseCount: 0,
    strengthIncreaseCount: 0,
    agilityIncreaseCount: 0,
    passingIncreaseCount: 0,
    armourIncreaseCount: 0,
  };

  it('PlayerSchema parses a valid player', () => {
    const parsed = PlayerSchema.parse({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      ...noLastingInjuries,
      ...noIncreases,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.name).toBe('Griff Oberwald');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('UpsertPlayerSchema accepts an empty name', () => {
    // Some BBL players legitimately have no name — unlike other entities,
    // players are not required to have a non-empty name.
    const parsed = UpsertPlayerSchema.parse({
      name: '',
      teamEraId: 10,
      positionId: 20,
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.name).toBe('');
  });

  it('UpsertPlayerSchema rejects an empty externalIds array', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        externalIds: [],
      }),
    ).toThrow();
  });

  it('UpsertPlayerSchema accepts an externalIds-only payload', () => {
    const parsed = UpsertPlayerSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.name).toBeUndefined();
    expect(parsed.teamEraId).toBeUndefined();
    expect(parsed.positionId).toBeUndefined();
  });

  it('UpsertPlayerSchema accepts an optional integer sppTotal', () => {
    const parsed = UpsertPlayerSchema.parse({
      sppTotal: 176,
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.sppTotal).toBe(176);
  });

  it('UpsertPlayerSchema leaves sppTotal undefined when omitted', () => {
    // "undefined means no instruction about that column" — an omitted
    // sppTotal must never clobber a previously-set value.
    const parsed = UpsertPlayerSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.sppTotal).toBeUndefined();
  });

  it('UpsertPlayerSchema rejects a non-integer sppTotal', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        sppTotal: 1.5,
        externalIds: [{ externalSystemId: 1, externalId: 'x' }],
      }),
    ).toThrow();
  });

  const validExternalIds = [{ externalSystemId: 1, externalId: 'x' }];
  const allCharacteristics = {
    move: 6,
    strength: 3,
    agility: 3,
    passing: 4,
    armour: 9,
  };

  it('PlayerSchema requires the five characteristics', () => {
    const parsed = PlayerSchema.parse({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      ...noLastingInjuries,
      ...noIncreases,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.move).toBe(6);
    expect(parsed.passing).toBe(4);
  });

  it('PlayerSchema accepts a null passing for a rules set without one', () => {
    const parsed = PlayerSchema.parse({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      move: 6,
      strength: 3,
      agility: 3,
      passing: null,
      armour: 8,
      ...noLastingInjuries,
      ...noIncreases,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.passing).toBeNull();
  });

  it('PlayerSchema rejects a player missing a characteristic', () => {
    expect(() =>
      PlayerSchema.parse({
        id: 1,
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        ...noLastingInjuries,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('PlayerSchema rejects a player missing a lasting-injury field', () => {
    expect(() =>
      PlayerSchema.parse({
        id: 1,
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('UpsertPlayerSchema accepts all five characteristics with a rulesSetId', () => {
    const parsed = UpsertPlayerSchema.parse({
      ...allCharacteristics,
      rulesSetId: 4,
      externalIds: validExternalIds,
    });
    expect(parsed.move).toBe(6);
    expect(parsed.rulesSetId).toBe(4);
  });

  it('UpsertPlayerSchema accepts a null passing alongside the other four', () => {
    const parsed = UpsertPlayerSchema.parse({
      ...allCharacteristics,
      passing: null,
      rulesSetId: 5,
      externalIds: validExternalIds,
    });
    expect(parsed.passing).toBeNull();
  });

  it('UpsertPlayerSchema accepts a payload with no characteristics at all', () => {
    const parsed = UpsertPlayerSchema.parse({
      name: 'Griff Oberwald',
      externalIds: validExternalIds,
    });
    expect(parsed.move).toBeUndefined();
    expect(parsed.rulesSetId).toBeUndefined();
  });

  it('UpsertPlayerSchema rejects a partial set of characteristics', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        move: 6,
        strength: 3,
        rulesSetId: 4,
        externalIds: validExternalIds,
      }),
    ).toThrow();
  });

  it('UpsertPlayerSchema rejects characteristics without a rulesSetId', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        ...allCharacteristics,
        externalIds: validExternalIds,
      }),
    ).toThrow();
  });

  it('UpsertPlayerSchema rejects a rulesSetId without characteristics', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        name: 'Griff Oberwald',
        rulesSetId: 4,
        externalIds: validExternalIds,
      }),
    ).toThrow();
  });

  it('PLAYER_CHARACTERISTIC_INCREASE_KEYS lists the five increase counts in characteristic order', () => {
    expect(PLAYER_CHARACTERISTIC_INCREASE_KEYS).toEqual([
      'moveIncreaseCount',
      'strengthIncreaseCount',
      'agilityIncreaseCount',
      'passingIncreaseCount',
      'armourIncreaseCount',
    ]);
  });

  it('PlayerSchema requires every increase count', () => {
    const parsed = PlayerSchema.parse({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      ...noLastingInjuries,
      ...noIncreases,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.moveIncreaseCount).toBe(0);

    const missing = PlayerSchema.safeParse({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      ...noLastingInjuries,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(missing.success).toBe(false);
  });

  it('UpsertPlayerSchema accepts the whole increase group', () => {
    const parsed = UpsertPlayerSchema.parse({
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      ...noIncreases,
      moveIncreaseCount: 2,
      externalIds: [{ externalSystemId: 1, externalId: '1' }],
    });
    expect(parsed.moveIncreaseCount).toBe(2);
  });

  it('UpsertPlayerSchema accepts a payload with no increase counts at all', () => {
    const parsed = UpsertPlayerSchema.safeParse({
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      externalIds: [{ externalSystemId: 1, externalId: '1' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('UpsertPlayerSchema rejects a partial increase group', () => {
    const parsed = UpsertPlayerSchema.safeParse({
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      moveIncreaseCount: 1,
      externalIds: [{ externalSystemId: 1, externalId: '1' }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain(
      'Characteristic increases are all-or-nothing',
    );
  });

  it('UpsertPlayerSchema rejects a negative increase count', () => {
    const parsed = UpsertPlayerSchema.safeParse({
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      ...noIncreases,
      armourIncreaseCount: -1,
      externalIds: [{ externalSystemId: 1, externalId: '1' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('UpsertPlayerSchema treats increases and lasting injuries as independent groups', () => {
    // A source could supply one group without the other, so a full increase
    // group with no lasting injuries (and vice versa) must both parse.
    expect(
      UpsertPlayerSchema.safeParse({
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        ...noIncreases,
        externalIds: [{ externalSystemId: 1, externalId: '1' }],
      }).success,
    ).toBe(true);
    expect(
      UpsertPlayerSchema.safeParse({
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        ...noLastingInjuries,
        externalIds: [{ externalSystemId: 1, externalId: '1' }],
      }).success,
    ).toBe(true);
  });
});

describe('SyncScrapedSppAdjustmentsSchema', () => {
  it('accepts a scraped total and a null scraped total', () => {
    const parsed = SyncScrapedSppAdjustmentsSchema.parse({
      players: [
        { playerId: 1, scrapedTotal: 16 },
        { playerId: 2, scrapedTotal: null },
      ],
    });

    expect(parsed.players).toHaveLength(2);
    expect(parsed.players[1].scrapedTotal).toBeNull();
  });

  it('rejects a missing scrapedTotal — omitted and null are different answers', () => {
    expect(() =>
      SyncScrapedSppAdjustmentsSchema.parse({ players: [{ playerId: 1 }] }),
    ).toThrow();
  });

  it('rejects a non-integer scraped total', () => {
    expect(() =>
      SyncScrapedSppAdjustmentsSchema.parse({
        players: [{ playerId: 1, scrapedTotal: 1.5 }],
      }),
    ).toThrow();
  });
});

describe('SyncReportedSppAdjustmentsSchema', () => {
  it('accepts players with no career counts', () => {
    expect(
      SyncReportedSppAdjustmentsSchema.parse({
        players: [{ playerId: 1 }, { playerId: 2 }],
      }),
    ).toEqual({ players: [{ playerId: 1 }, { playerId: 2 }] });
  });

  it('accepts a player carrying career counts', () => {
    const counts = {
      touchdown: 12,
      completion: 4,
      interception: 2,
      mvp_award: 3,
      casualty: 5,
    };
    expect(
      SyncReportedSppAdjustmentsSchema.parse({
        players: [{ playerId: 1, careerCounts: counts }],
      }),
    ).toEqual({ players: [{ playerId: 1, careerCounts: counts }] });
  });

  it('rejects a non-integer player id', () => {
    expect(() =>
      SyncReportedSppAdjustmentsSchema.parse({ players: [{ playerId: 1.5 }] }),
    ).toThrow();
  });

  it('rejects a negative career count', () => {
    expect(() =>
      SyncReportedSppAdjustmentsSchema.parse({
        players: [
          {
            playerId: 1,
            careerCounts: {
              touchdown: -1,
              completion: 0,
              interception: 0,
              mvp_award: 0,
              casualty: 0,
            },
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects career counts missing a group', () => {
    expect(() =>
      SyncReportedSppAdjustmentsSchema.parse({
        players: [
          {
            playerId: 1,
            careerCounts: {
              touchdown: 1,
              completion: 0,
              interception: 0,
              mvp_award: 0,
            },
          },
        ],
      }),
    ).toThrow();
  });
});

describe('SPP_CAREER_COUNT_KEYS', () => {
  it('lists every career-count group exactly once', () => {
    expect([...SPP_CAREER_COUNT_KEYS]).toEqual([
      'touchdown',
      'completion',
      'interception',
      'mvp_award',
      'casualty',
    ]);
  });
});

describe('PLAYER_LASTING_INJURY_KEYS', () => {
  it('lists every lasting-injury field exactly once', () => {
    expect([...PLAYER_LASTING_INJURY_KEYS]).toEqual([
      'missNextGame',
      'nigglingInjuryCount',
      'moveReductionCount',
      'strengthReductionCount',
      'agilityReductionCount',
      'passingReductionCount',
      'armourReductionCount',
    ]);
  });
});

describe('SyncLastingInjuryHistorySchema', () => {
  it('accepts a list of player ids, including an empty list', () => {
    expect(
      SyncLastingInjuryHistorySchema.parse({ playerIds: [1, 2, 3] }),
    ).toEqual({ playerIds: [1, 2, 3] });
    expect(SyncLastingInjuryHistorySchema.parse({ playerIds: [] })).toEqual({
      playerIds: [],
    });
  });

  it('rejects a missing playerIds', () => {
    expect(() => SyncLastingInjuryHistorySchema.parse({})).toThrow();
  });
});

describe('SyncLastingInjuryHistoryResultSchema', () => {
  it('accepts the backfilled player ids', () => {
    expect(
      SyncLastingInjuryHistoryResultSchema.parse({
        backfilledPlayerIds: [7],
      }),
    ).toEqual({ backfilledPlayerIds: [7] });
  });
});

describe('SyncSppAdjustmentsResultSchema', () => {
  it('accepts the updated player ids', () => {
    expect(
      SyncSppAdjustmentsResultSchema.parse({ updatedPlayerIds: [3] }),
    ).toEqual({ updatedPlayerIds: [3] });
  });

  it('accepts a nonzero-adjustment summary', () => {
    expect(
      SyncSppAdjustmentsResultSchema.parse({
        updatedPlayerIds: [3],
        nonzeroAdjustments: [
          {
            playerId: 3,
            name: 'Karcheres',
            adjustment: 6,
            hadCareerCounts: true,
          },
        ],
      }),
    ).toEqual({
      updatedPlayerIds: [3],
      nonzeroAdjustments: [
        {
          playerId: 3,
          name: 'Karcheres',
          adjustment: 6,
          hadCareerCounts: true,
        },
      ],
    });
  });

  it('rejects a nonzero-adjustment entry with hadCareerCounts omitted', () => {
    expect(() =>
      SyncSppAdjustmentsResultSchema.parse({
        updatedPlayerIds: [3],
        nonzeroAdjustments: [
          {
            playerId: 3,
            name: 'Karcheres',
            adjustment: 6,
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects a nonzero-adjustment entry with a non-boolean hadCareerCounts', () => {
    expect(() =>
      SyncSppAdjustmentsResultSchema.parse({
        updatedPlayerIds: [3],
        nonzeroAdjustments: [
          {
            playerId: 3,
            name: 'Karcheres',
            adjustment: 6,
            hadCareerCounts: 'true',
          },
        ],
      }),
    ).toThrow();
  });
});
