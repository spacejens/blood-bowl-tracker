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

  it('does nothing for a non-gameplay event type (administrative events are Task 9)', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'weather_roll',
              tpEventId: 6,
              instant: 'x',
              weatherType: 1,
            },
          ],
        }),
      ],
    });
    expect(captured).toHaveLength(0);
  });
});
