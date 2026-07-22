import type {
  ExternalSystemBootstrapService,
  MatchEventsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpMatchEventsImportService } from './tp-match-events-import.service';
import {
  AWAY_ROSTER_ID,
  AWAY_TEAM_ERA_ID,
  COMPETITION_DB_ID,
  ERA_ID,
  HOME_ROSTER_ID,
  HOME_TEAM_ERA_ID,
  makeService,
  MATCH_DB_ID,
  matchWithEvents,
  runImport,
  runImportWithErrors,
  TP_SYSTEM_ID,
} from './tp-match-events-import.test-helpers';

/**
 * Administrative TP match events and error-handling paths. Gameplay events
 * (touchdown, mvp_award, the other simple actions, sent_off,
 * injury/casualty) are covered in `tp-match-events-gameplay.spec.ts` — split
 * out to stay under this repo's 1000-line spec file ceiling.
 */
describe('TpMatchEventsImportService', () => {
  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertMatchEvent = vi.fn();
    const service = new TpMatchEventsImportService(
      { upsertMatchEvent } as unknown as MatchEventsImportService,
      {
        bootstrap: vi.fn().mockResolvedValue({
          ok: false,
          error: { item: { externalSystems: ['TP'] }, message: 'boom' },
        }),
      } as unknown as ExternalSystemBootstrapService,
      {
        getTpSystemName: () => 'TP',
      } as unknown as ExternalSystemNameConfigService,
    );

    const { result } = await service.importMatchEvents({
      matchesByCompetitionId: new Map([
        [COMPETITION_DB_ID, [matchWithEvents({ id: 566088, events: [] })]],
      ]),
      eraIdByCompetitionId: new Map([[COMPETITION_DB_ID, ERA_ID]]),
      matchIdsByTpId: new Map([[566088, MATCH_DB_ID]]),
      teamErasByRosterId: new Map(),
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
    });

    expect(upsertMatchEvent).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.success).toBe(false);
  });

  it('emits a null-player event and records a non-fatal error for an unresolvable lineUpId', async () => {
    const { errors, captured } = await runImportWithErrors({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'touchdown',
              tpEventId: 5,
              instant: 'x',
              lineUpId: 999999,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured[0].actingPlayerId).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('records a non-fatal error and skips a competition whose era cannot be resolved', async () => {
    const upsertMatchEvent = vi.fn().mockResolvedValue(true);
    const service = makeService(upsertMatchEvent);

    const { result } = await service.importMatchEvents({
      matchesByCompetitionId: new Map([
        [
          COMPETITION_DB_ID,
          [
            matchWithEvents({
              id: 566088,
              events: [
                {
                  type: 'touchdown',
                  tpEventId: 1,
                  instant: 'x',
                  lineUpId: 2442075,
                  rosterId: HOME_ROSTER_ID,
                },
              ],
            }),
          ],
        ],
      ]),
      eraIdByCompetitionId: new Map(),
      matchIdsByTpId: new Map([[566088, MATCH_DB_ID]]),
      teamErasByRosterId: new Map(),
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
    });

    expect(upsertMatchEvent).not.toHaveBeenCalled();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('records a non-fatal error and skips a match with no imported match id', async () => {
    const upsertMatchEvent = vi.fn().mockResolvedValue(true);
    const service = makeService(upsertMatchEvent);

    const { result } = await service.importMatchEvents({
      matchesByCompetitionId: new Map([
        [
          COMPETITION_DB_ID,
          [
            matchWithEvents({
              id: 566088,
              events: [
                {
                  type: 'touchdown',
                  tpEventId: 1,
                  instant: 'x',
                  lineUpId: 2442075,
                  rosterId: HOME_ROSTER_ID,
                },
              ],
            }),
          ],
        ],
      ]),
      eraIdByCompetitionId: new Map([[COMPETITION_DB_ID, ERA_ID]]),
      matchIdsByTpId: new Map(),
      teamErasByRosterId: new Map(),
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
    });

    expect(upsertMatchEvent).not.toHaveBeenCalled();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('emits a neutral eventType weather event with the weatherType payload', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'weather_roll',
              tpEventId: 10,
              instant: 'x',
              weatherType: 'perfect_conditions',
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        matchId: MATCH_DB_ID,
        eventType: 'weather',
        weatherType: 'perfect_conditions',
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-10' }],
      }),
    );
    expect(captured[0].actionType).toBeUndefined();
    expect(captured[0].actingTeamEraId).toBeUndefined();
  });

  it('emits an acting inducements event with inducementsCost', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'inducements_roll',
              tpEventId: 11,
              instant: 'x',
              rosterId: HOME_ROSTER_ID,
              totalCost: 80,
              starPlayers: [],
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'inducements',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        inducementsCost: 80,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-11' }],
      }),
    );
    expect(captured[0].inducementsFromTreasury).toBeUndefined();
  });

  it('emits an acting inducements event with inducementsFromTreasury when present', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'inducements_roll',
              tpEventId: 24,
              instant: 'x',
              rosterId: HOME_ROSTER_ID,
              totalCost: 80,
              starPlayers: [],
              fromTreasury: 50,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'inducements',
        inducementsCost: 80,
        inducementsFromTreasury: 50,
      }),
    );
  });

  it('emits an acting journeymen_signings event with journeymenCount', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'journeyman_signing',
              tpEventId: 15,
              instant: 'x',
              rosterId: AWAY_ROSTER_ID,
              journeymenCount: 2,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'journeymen_signings',
        actingTeamEraId: AWAY_TEAM_ERA_ID,
        journeymenCount: 2,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-15' }],
      }),
    );
  });

  it('emits an acting secret_objective with secretObjective', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'secret_objective',
              tpEventId: 42,
              instant: 'x',
              rosterId: HOME_ROSTER_ID,
              secretObjective: 3,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'secret_objective',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        secretObjective: 3,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-42' }],
      }),
    );
  });

  it('emits an expensive_mistake consequence for the acting roster', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'expensive_mistake',
              tpEventId: 14,
              instant: 'x',
              rosterId: AWAY_ROSTER_ID,
              expensiveMistake: 5,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'expensive_mistake',
        consequenceTeamEraId: AWAY_TEAM_ERA_ID,
        expensiveMistake: 5,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-14' }],
      }),
    );
  });

  it('emits two winnings events, one per side, with distinct external ids', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'winnings_roll',
              tpEventId: 12,
              instant: 'x',
              localWinnings: 30000,
              visitorWinnings: 10000,
            },
          ],
        }),
      ],
    });
    expect(captured.map((c) => c.externalIds[0].externalId).sort()).toEqual([
      'tp-12-away',
      'tp-12-home',
    ]);
    expect(
      captured.find((c) => c.actingTeamEraId === HOME_TEAM_ERA_ID)?.winnings,
    ).toBe(30000);
    expect(
      captured.find((c) => c.actingTeamEraId === AWAY_TEAM_ERA_ID)?.winnings,
    ).toBe(10000);
    expect(captured.every((c) => c.actionType === 'winnings')).toBe(true);
  });

  it('emits two fan_factor events, one per side', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'fan_factor_roll',
              tpEventId: 13,
              instant: 'x',
              newFanFactorLocal: 7,
              newFanFactorVisitor: 9,
            },
          ],
        }),
      ],
    });
    expect(captured.map((c) => c.externalIds[0].externalId).sort()).toEqual([
      'tp-13-away',
      'tp-13-home',
    ]);
    expect(
      captured.find((c) => c.actingTeamEraId === HOME_TEAM_ERA_ID)?.fanFactor,
    ).toBe(7);
    expect(
      captured.find((c) => c.actingTeamEraId === AWAY_TEAM_ERA_ID)?.fanFactor,
    ).toBe(9);
    expect(captured.every((c) => c.actionType === 'fan_factor')).toBe(true);
  });

  it('emits two dedicated_fans consequence events, one per side, as consequences', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'dedicated_fans_roll',
              tpEventId: 26,
              instant: 'x',
              dedicatedFansModifierLocal: 1,
              dedicatedFansModifierVisitor: -1,
            },
          ],
        }),
      ],
    });
    expect(captured.map((c) => c.externalIds[0].externalId).sort()).toEqual([
      'tp-26-away',
      'tp-26-home',
    ]);
    expect(
      captured.find((c) => c.consequenceTeamEraId === HOME_TEAM_ERA_ID)
        ?.dedicatedFans,
    ).toBe(1);
    expect(
      captured.find((c) => c.consequenceTeamEraId === AWAY_TEAM_ERA_ID)
        ?.dedicatedFans,
    ).toBe(-1);
    expect(captured.every((c) => c.consequenceType === 'dedicated_fans')).toBe(
      true,
    );
    expect(captured.every((c) => c.actionType === undefined)).toBe(true);
  });

  it('skips a dedicated_fans side whose modifier is 0', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'dedicated_fans_roll',
              tpEventId: 27,
              instant: 'x',
              dedicatedFansModifierLocal: 0,
              dedicatedFansModifierVisitor: -1,
            },
          ],
        }),
      ],
    });
    expect(captured.map((c) => c.externalIds[0].externalId)).toEqual([
      'tp-27-away',
    ]);
  });

  it('emits no dedicated_fans event when both sides are unchanged', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'dedicated_fans_roll',
              tpEventId: 28,
              instant: 'x',
              dedicatedFansModifierLocal: 0,
              dedicatedFansModifierVisitor: 0,
            },
          ],
        }),
      ],
    });
    expect(captured).toEqual([]);
  });

  it('emits a neutral prayers_to_nuffle with the prayersToNuffle payload', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'prayers_to_nuffle',
              tpEventId: 23,
              instant: 'x',
              prayersToNuffle: 4,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'prayers_to_nuffle',
        prayersToNuffle: 4,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-23' }],
      }),
    );
    expect(captured[0].actingTeamEraId).toBeUndefined();
  });

  it('emits a concession consequence for the conceding side (home)', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'concession',
              tpEventId: 20,
              instant: 'x',
              concedeLocal: true,
              concedeVisitor: false,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'concession',
        consequenceTeamEraId: HOME_TEAM_ERA_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-20' }],
      }),
    );
  });

  it('emits a concession consequence for the conceding side (away)', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'concession',
              tpEventId: 21,
              instant: 'x',
              concedeLocal: false,
              concedeVisitor: true,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'concession',
        consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      }),
    );
  });

  it('omits consequenceTeamEraId for a concession where neither side conceded', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'concession',
              tpEventId: 22,
              instant: 'x',
              concedeLocal: false,
              concedeVisitor: false,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({ consequenceType: 'concession' }),
    );
    expect(captured[0].consequenceTeamEraId).toBeUndefined();
  });

  it('omits actingTeamEraId for an inducements event with an unresolvable rosterId', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'inducements_roll',
              tpEventId: 25,
              instant: 'x',
              rosterId: 999999,
              totalCost: 40,
              starPlayers: [],
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'inducements',
        inducementsCost: 40,
      }),
    );
    expect(captured[0].actingTeamEraId).toBeUndefined();
  });
});
