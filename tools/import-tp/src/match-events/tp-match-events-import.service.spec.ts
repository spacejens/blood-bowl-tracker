import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { BuildEventDataOptions } from './tp-match-events-builder.types';
import {
  AWAY_PLAYER_ID,
  AWAY_ROSTER_ID,
  AWAY_TEAM_ERA_ID,
  CANNED_RESULT,
  COMPETITION_DB_ID,
  ERA_ID,
  HOME_PLAYER_ID,
  HOME_ROSTER_ID,
  HOME_TEAM_ERA_ID,
  makeService,
  MATCH_DB_ID,
  matchWithEvents,
  resultArgs,
  runImport,
  runImportRaw,
  TP_SYSTEM_ID,
} from './tp-match-events-import.test-helpers';

const TOUCHDOWN = {
  type: 'touchdown',
  tpEventId: 1,
  instant: 'x',
  lineUpId: 2442075,
  rosterId: HOME_ROSTER_ID,
} as const;

function upsertEvent(externalId: string): UpsertMatchEvent {
  return {
    matchId: MATCH_DB_ID,
    actionType: 'touchdown',
    externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId }],
  };
}

/**
 * `TpMatchEventsImportService` owns iteration, per-match options assembly,
 * delegation to `TpMatchEventsBuilderService`, upserting whatever comes
 * back, and error threading — not event content. Its loop is identical for
 * every event kind, so this suite is deliberately kind-agnostic; the
 * per-kind construction is covered by
 * `tp-match-events-builder.service.spec.ts` (dispatch) and
 * `tp-match-event-kind-builders-{gameplay,admin}.spec.ts` (content).
 */
describe('TpMatchEventsImportService', () => {
  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertMatchEvent = vi.fn();
    const { service, importResults } = await makeService(upsertMatchEvent, {
      bootstrapResult: {
        ok: false,
        error: { item: { externalSystems: ['TP'] }, message: 'boom' },
      },
    });

    await service.importMatchEvents({
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
    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ externalSystems: ['TP'] });
  });

  it('records a non-fatal error and skips a competition whose era cannot be resolved', async () => {
    const upsertMatchEvent = vi.fn().mockResolvedValue(true);
    const { service, importResults } = await makeService(upsertMatchEvent);

    await service.importMatchEvents({
      matchesByCompetitionId: new Map([
        [
          COMPETITION_DB_ID,
          [matchWithEvents({ id: 566088, events: [TOUCHDOWN] })],
        ],
      ]),
      eraIdByCompetitionId: new Map(),
      matchIdsByTpId: new Map([[566088, MATCH_DB_ID]]),
      teamErasByRosterId: new Map(),
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
    });

    expect(upsertMatchEvent).not.toHaveBeenCalled();
    expect(resultArgs(importResults).errors.length).toBeGreaterThan(0);
  });

  it('records a non-fatal error and skips a match with no imported match id', async () => {
    const upsertMatchEvent = vi.fn().mockResolvedValue(true);
    const { service, importResults } = await makeService(upsertMatchEvent);

    await service.importMatchEvents({
      matchesByCompetitionId: new Map([
        [
          COMPETITION_DB_ID,
          [matchWithEvents({ id: 566088, events: [TOUCHDOWN] })],
        ],
      ]),
      eraIdByCompetitionId: new Map([[COMPETITION_DB_ID, ERA_ID]]),
      matchIdsByTpId: new Map(),
      teamErasByRosterId: new Map(),
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
    });

    expect(upsertMatchEvent).not.toHaveBeenCalled();
    expect(resultArgs(importResults).errors.length).toBeGreaterThan(0);
  });

  it('iterates every match of every competition, resolving each competition against its own era', async () => {
    const upsertMatchEvent = vi.fn().mockResolvedValue(true);
    const { service, importResults, eventsBuilder } =
      await makeService(upsertMatchEvent);
    const matchA = matchWithEvents({ id: 1, events: [TOUCHDOWN] });
    const matchB = matchWithEvents({ id: 2, events: [TOUCHDOWN] });
    const matchC = matchWithEvents({ id: 3, events: [TOUCHDOWN] });

    await service.importMatchEvents({
      matchesByCompetitionId: new Map<number, TpMatch[]>([
        [900, [matchA, matchB]],
        [901, [matchC]],
      ]),
      eraIdByCompetitionId: new Map([
        [900, ERA_ID],
        [901, 600],
      ]),
      matchIdsByTpId: new Map([
        [1, 11],
        [2, 12],
        [3, 13],
      ]),
      teamErasByRosterId: new Map(),
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
    });

    expect(eventsBuilder.buildEventData).toHaveBeenCalledTimes(3);
    const calls = eventsBuilder.buildEventData.mock.calls.map(
      ([options]) => options,
    );
    expect(calls.map((o) => o.matchId)).toEqual([11, 12, 13]);
    expect(calls.map((o) => o.eraId)).toEqual([ERA_ID, ERA_ID, 600]);
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(3);
    expect(errors).toEqual([]);
  });

  it('passes the fully assembled per-match options to buildEventData for every event', async () => {
    const eventA = { ...TOUCHDOWN, tpEventId: 100 };
    const eventB = { ...TOUCHDOWN, tpEventId: 101, rosterId: AWAY_ROSTER_ID };
    const correlationResult = {
      casualtyByInjuryEventId: new Map(),
      pairedCasualtyEventIds: new Set([777]),
    };
    const foulCorrelationResult = {
      foulByInjuryEventId: new Map(),
      pairedFoulEventIds: new Set([888]),
    };
    const { eventsBuilder } = await runImportRaw({
      matches: [matchWithEvents({ id: 566088, events: [eventA, eventB] })],
      correlationResult,
      foulCorrelationResult,
    });

    expect(eventsBuilder.buildEventData).toHaveBeenCalledTimes(2);
    const [first, second] = eventsBuilder.buildEventData.mock.calls.map(
      ([options]) => options,
    );
    expect(first).toEqual({
      event: eventA,
      matchId: MATCH_DB_ID,
      eraId: ERA_ID,
      tpSystemId: TP_SYSTEM_ID,
      teamErasByRosterId: new Map([
        [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID }]],
        [AWAY_ROSTER_ID, [{ id: AWAY_TEAM_ERA_ID, eraId: ERA_ID }]],
      ]),
      playerIdsByLineUpId: new Map([
        [2442075, HOME_PLAYER_ID],
        [2459782, AWAY_PLAYER_ID],
      ]),
      homeTeamEraId: HOME_TEAM_ERA_ID,
      awayTeamEraId: AWAY_TEAM_ERA_ID,
      errors: [],
      casualtyPairing: correlationResult,
      foulPairing: foulCorrelationResult,
    });
    expect(second.event).toBe(eventB);
  });

  it('resolves the home and away team eras once per match, from the match roster ids', async () => {
    const { eventsBuilder } = await runImportRaw({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            { ...TOUCHDOWN, tpEventId: 1 },
            { ...TOUCHDOWN, tpEventId: 2 },
          ],
        }),
      ],
    });

    expect(eventsBuilder.resolveTeamEraId).toHaveBeenCalledTimes(2);
    expect(eventsBuilder.resolveTeamEraId).toHaveBeenCalledWith(
      expect.objectContaining({ rosterId: HOME_ROSTER_ID, eraId: ERA_ID }),
    );
    expect(eventsBuilder.resolveTeamEraId).toHaveBeenCalledWith(
      expect.objectContaining({ rosterId: AWAY_ROSTER_ID, eraId: ERA_ID }),
    );
  });

  it('upserts one event per item returned by buildEventData, in order', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            { ...TOUCHDOWN, tpEventId: 1 },
            { ...TOUCHDOWN, tpEventId: 2 },
          ],
        }),
      ],
      buildEventData: (options: BuildEventDataOptions) =>
        options.event.tpEventId === 1
          ? [upsertEvent('a'), upsertEvent('b')]
          : [upsertEvent('c')],
    });

    expect(captured.map((c) => c.externalIds[0].externalId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('upserts nothing for an event whose buildEventData returns no items', async () => {
    const { captured, errors } = await runImportRaw({
      matches: [matchWithEvents({ id: 566088, events: [TOUCHDOWN] })],
      buildEventData: () => [],
    });

    expect(captured).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('surfaces an error that buildEventData pushed onto the shared errors array', async () => {
    const { errors, captured } = await runImportRaw({
      matches: [matchWithEvents({ id: 566088, events: [TOUCHDOWN] })],
      buildEventData: (options: BuildEventDataOptions) => {
        options.errors.push({
          item: { match: options.matchId },
          message: 'Player lineUpId "999999" has no imported id.',
        });
        return [upsertEvent('tp-1')];
      },
    });

    expect(captured).toHaveLength(1);
    expect(errors).toEqual([
      {
        item: { match: MATCH_DB_ID },
        message: 'Player lineUpId "999999" has no imported id.',
      },
    ]);
  });

  it('does not count an event toward imported when upsertMatchEvent resolves false', async () => {
    const upsertMatchEvent = vi.fn().mockResolvedValue(false);
    const { service, importResults } = await makeService(upsertMatchEvent);

    await service.importMatchEvents({
      matchesByCompetitionId: new Map([
        [
          COMPETITION_DB_ID,
          [matchWithEvents({ id: 566088, events: [TOUCHDOWN] })],
        ],
      ]),
      eraIdByCompetitionId: new Map([[COMPETITION_DB_ID, ERA_ID]]),
      matchIdsByTpId: new Map([[566088, MATCH_DB_ID]]),
      teamErasByRosterId: new Map(),
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
    });

    expect(upsertMatchEvent).toHaveBeenCalledTimes(1);
    expect(resultArgs(importResults).imported).toBe(0);
  });

  it('returns the ImportResultService.result() return value unchanged', async () => {
    const upsertMatchEvent = vi.fn().mockResolvedValue(true);
    const { service } = await makeService(upsertMatchEvent);

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

    expect(result).toBe(CANNED_RESULT);
  });

  it('opens one batch for the run and flushes it once at the end', async () => {
    const upsertMatchEvent = vi.fn().mockResolvedValue(true);
    const { service, matchEventsImport } = await makeService(upsertMatchEvent);

    await service.importMatchEvents({
      matchesByCompetitionId: new Map([
        [
          COMPETITION_DB_ID,
          [matchWithEvents({ id: 566088, events: [TOUCHDOWN] })],
        ],
      ]),
      eraIdByCompetitionId: new Map([[COMPETITION_DB_ID, ERA_ID]]),
      matchIdsByTpId: new Map([[566088, MATCH_DB_ID]]),
      teamErasByRosterId: new Map(),
      playerIdsByLineUpId: new Map(),
      starPlayerIdsByRosterAndMaster: new Map(),
    });

    expect(matchEventsImport.createBatch).toHaveBeenCalledTimes(1);
    expect(matchEventsImport.flushBatch).toHaveBeenCalledTimes(1);
  });
});
