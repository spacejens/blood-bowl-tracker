import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemBootstrapService,
  ImportError,
  MatchEventsImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch, TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpMatchEventsImportService } from './tp-match-events-import.service';

const TP_SYSTEM_ID = 1;
const COMPETITION_DB_ID = 900;
const MATCH_DB_ID = 7;
const HOME_TEAM_ERA_ID = 501;
const AWAY_TEAM_ERA_ID = 502;
const SCORER_PLAYER_ID = 8001;
const VICTIM_PLAYER_ID = 8002;
const HOME_ROSTER_ID = 164868;
const AWAY_ROSTER_ID = 167242;
const ERA_ID = 500;

function matchWithEvents(options: {
  id: number;
  events: TpMatchEvent[];
}): TpMatch {
  return {
    id: options.id,
    playedDate: new Date('2021-05-15T18:00:00Z'),
    name: 'Round 1',
    homeTeamTpId: HOME_ROSTER_ID,
    awayTeamTpId: AWAY_ROSTER_ID,
    matchEvents: options.events,
    homeRosterPlayers: [],
    awayRosterPlayers: [],
  };
}

interface RunImportOptions {
  matches: TpMatch[];
}

function makeService(upsertMatchEvent: ReturnType<typeof vi.fn>) {
  return new TpMatchEventsImportService(
    { upsertMatchEvent } as unknown as MatchEventsImportService,
    {
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [TP_SYSTEM_ID] }),
    } as unknown as ExternalSystemBootstrapService,
    {
      getTpSystemName: () => 'TP',
    } as unknown as ExternalSystemNameConfigService,
  );
}

async function runImportRaw({ matches }: RunImportOptions): Promise<{
  captured: UpsertMatchEvent[];
  errors: ImportError[];
}> {
  const captured: UpsertMatchEvent[] = [];
  const upsertMatchEvent = vi.fn(
    (data: UpsertMatchEvent, errors: ImportError[]) => {
      void errors;
      captured.push(data);
      return Promise.resolve(true);
    },
  );
  const service = makeService(upsertMatchEvent);

  const { result } = await service.importMatchEvents({
    matchesByCompetitionId: new Map([[COMPETITION_DB_ID, matches]]),
    eraIdByCompetitionId: new Map([[COMPETITION_DB_ID, ERA_ID]]),
    matchIdsByTpId: new Map([[566088, MATCH_DB_ID]]),
    teamErasByRosterId: new Map([
      [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID }]],
      [AWAY_ROSTER_ID, [{ id: AWAY_TEAM_ERA_ID, eraId: ERA_ID }]],
    ]),
    playerIdsByLineUpId: new Map([
      [2442075, SCORER_PLAYER_ID],
      [2459782, VICTIM_PLAYER_ID],
    ]),
    starPlayerIdsByRosterAndMaster: new Map(),
  });

  return { captured, errors: result.errors };
}

async function runImport(
  options: RunImportOptions,
): Promise<UpsertMatchEvent[]> {
  const { captured } = await runImportRaw(options);
  return captured;
}

async function runImportWithErrors(
  options: RunImportOptions,
): Promise<{ captured: UpsertMatchEvent[]; errors: ImportError[] }> {
  return runImportRaw(options);
}

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

  it('emits a touchdown event with the scorer and scoring team-era', async () => {
    const captured = await runImport({
      matches: [
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
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        matchId: MATCH_DB_ID,
        actionType: 'touchdown',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-1' }],
      }),
    );
  });

  it('maps a Dead injury to a death consequence with the victim, and casualty action for the opponent', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'injury',
              tpEventId: 2,
              instant: 'x',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: HOME_ROSTER_ID,
              injuryType: 'Dead',
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'death',
        consequenceTeamEraId: AWAY_TEAM_ERA_ID,
        consequencePlayerId: VICTIM_PLAYER_ID,
        actionType: 'death',
        actingTeamEraId: HOME_TEAM_ERA_ID,
      }),
    );
  });

  it('emits a PA stat loss as a consequence-only event when self-inflicted', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'injury',
              tpEventId: 3,
              instant: 'x',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: AWAY_ROSTER_ID,
              injuryType: 'PA',
            },
          ],
        }),
      ],
    });
    const event = captured.find(
      (c) => c.consequenceType === 'stat_reduction_pa',
    );
    expect(event).toBeDefined();
    expect(event?.actionType).toBeUndefined();
    expect(event?.actingTeamEraId).toBeUndefined();
  });

  it('skips None injuries', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'injury',
              tpEventId: 4,
              instant: 'x',
              lineUpId: 1,
              rosterId: AWAY_ROSTER_ID,
              injuryType: 'None',
            },
          ],
        }),
      ],
    });
    expect(captured).toHaveLength(0);
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
              weatherType: 104,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        matchId: MATCH_DB_ID,
        eventType: 'weather',
        weatherType: 104,
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
