import type {
  UpsertMatchEvent,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import type { BatchBuffer } from '@blood-bowl-tracker/import';
import { describe, expect, it } from 'vitest';

import type { BblMatchEvents } from '../matches/match-events-page-parser';
import {
  BBL_SYSTEM_ID,
  competition,
  makeService,
  makeTeamRecord,
  MATCH_DB_ID,
  resultArgs,
} from './bbl-match-events-import.test-helpers';

/**
 * Merge-specific scenarios for BblMatchEventsImportService, split out of
 * bbl-match-events-import.service.spec.ts to keep both files under the
 * *.spec.ts line ceiling. Each test wires its own mocks directly (rather than
 * the single-match `runImport` helper) because merged-pair imports combine
 * two source event pages into one pass.
 */
describe('BblMatchEventsImportService merge scenarios', () => {
  it('scenario merge: an event pairing a primary-source action with a secondary-source consequence resolves each side to its own team era', async () => {
    const PRIMARY = '1061';
    const SECONDARY = '1062';

    const eventsA: BblMatchEvents = {
      bblId: PRIMARY,
      homeTeamId: 'a1',
      awayTeamId: 'a2',
      actions: [
        { actionType: 'serious_injury', side: 'home', pid: 'attacker' },
      ],
      consequences: [],
    };
    const eventsB: BblMatchEvents = {
      bblId: SECONDARY,
      homeTeamId: 'b1',
      awayTeamId: 'b2',
      actions: [],
      consequences: [
        { consequenceType: 'miss_next_game', side: 'home', pid: 'victim' },
      ],
    };

    const teamsByCode = new Map<string, UpsertTeam>([
      ['a1', { name: 'A1', raceId: 1, coachId: 1, eras: [], externalIds: [] }],
      ['a2', { name: 'A2', raceId: 2, coachId: 1, eras: [], externalIds: [] }],
      ['b1', { name: 'B1', raceId: 3, coachId: 1, eras: [], externalIds: [] }],
      ['b2', { name: 'B2', raceId: 4, coachId: 1, eras: [], externalIds: [] }],
    ]);
    const eraIdByName: Record<string, number> = {
      a1: 101,
      a2: 102,
      b1: 103,
      b2: 104,
    };

    const { service, mocks } = await makeService();
    mocks.teamsImport.upsert.mockImplementation((data) =>
      Promise.resolve(
        makeTeamRecord([
          {
            id: eraIdByName[data.name!.toLowerCase()],
            eraId: data.eras?.[0] ?? 0,
          },
        ]),
      ),
    );
    const captured: UpsertMatchEvent[] = [];
    const batch = { pending: [] } as unknown as BatchBuffer<UpsertMatchEvent>;
    mocks.matchEventsImport.createBatch.mockReturnValue(batch);
    mocks.matchEventsImport.addToBatch.mockImplementation((_batch, data) => {
      captured.push(data);
      return Promise.resolve(1);
    });
    mocks.matchEventsImport.flushBatch.mockResolvedValue(0);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      new Map([
        [
          '32',
          [
            { bblId: PRIMARY, date: new Date(Date.UTC(2016, 8, 25)) },
            { bblId: SECONDARY, date: new Date(Date.UTC(2016, 8, 24)) },
          ],
        ],
      ]),
    );
    mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
      new Map([
        [PRIMARY, eventsA],
        [SECONDARY, eventsB],
      ]),
    );
    mocks.matchMerge.resolve.mockResolvedValue({
      primaryBblIdByBblId: new Map([
        [PRIMARY, PRIMARY],
        [SECONDARY, PRIMARY],
      ]),
      partnerBblId: (bblId) =>
        bblId === PRIMARY
          ? SECONDARY
          : bblId === SECONDARY
            ? PRIMARY
            : undefined,
      isPrimary: (bblId) => bblId === PRIMARY,
      isSecondary: (bblId) => bblId === SECONDARY,
      effectivePlayedAt: (_bblId, rawDate) => rawDate,
    });
    mocks.correlation.combineOccurrences.mockReturnValue({
      teamCodes: ['a1', 'a2', 'b1', 'b2'],
      actions: [],
      consequences: [],
      journeymenSignings: [],
    });
    mocks.correlation.correlateEvents.mockReturnValue([
      {
        actionType: 'serious_injury',
        consequenceType: 'miss_next_game',
        actingTeamCode: 'a1',
        actingSourceBblId: PRIMARY,
        actingPid: 'attacker',
        consequenceTeamCode: 'b1',
        consequenceSourceBblId: SECONDARY,
        consequencePid: 'victim',
      },
    ]);

    await service.importMatchEvents({
      competitionsByBblId: new Map([
        [
          '32',
          {
            ...competition,
            externalIds: [
              { externalSystemId: BBL_SYSTEM_ID, externalId: '32' },
            ],
          },
        ],
      ]),
      teamsByCode,
      // Both source ids point at the same DB match id.
      matchIdsByBblId: new Map([
        [PRIMARY, MATCH_DB_ID],
        [SECONDARY, MATCH_DB_ID],
      ]),
      playerIdsByPid: new Map([
        ['attacker', 900],
        ['victim', 901],
      ]),
    });

    // Both source pages' occurrences are combined into a single pass for the
    // merged pair.
    expect(mocks.correlation.combineOccurrences).toHaveBeenCalledWith(
      eventsA,
      eventsB,
    );
    expect(resultArgs(mocks.importResults).errors).toEqual([]);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      matchId: MATCH_DB_ID,
      actionType: 'serious_injury',
      consequenceType: 'miss_next_game',
      actingTeamEraId: 101,
      consequenceTeamEraId: 103,
      actingPlayerId: 900,
      consequencePlayerId: 901,
    });
    // External id uses the ACTION's source bblId + team code.
    expect(captured[0].externalIds[0].externalId).toBe('1061-a1-serious-0');
    // The secondary match is not processed on its own (no standalone events).
    expect(captured).toHaveLength(1);
  });

  it('scenario merge: primary events page missing still combines and imports the secondary partner occurrences', async () => {
    const PRIMARY = '1061';
    const SECONDARY = '1062';

    const eventsB: BblMatchEvents = {
      bblId: SECONDARY,
      homeTeamId: 'b1',
      awayTeamId: 'b2',
      actions: [],
      consequences: [
        { consequenceType: 'miss_next_game', side: 'home', pid: 'victim' },
      ],
    };

    const teamsByCode = new Map<string, UpsertTeam>([
      ['a1', { name: 'A1', raceId: 1, coachId: 1, eras: [], externalIds: [] }],
      ['a2', { name: 'A2', raceId: 2, coachId: 1, eras: [], externalIds: [] }],
      ['b1', { name: 'B1', raceId: 3, coachId: 1, eras: [], externalIds: [] }],
      ['b2', { name: 'B2', raceId: 4, coachId: 1, eras: [], externalIds: [] }],
    ]);
    const eraIdByName: Record<string, number> = {
      a1: 101,
      a2: 102,
      b1: 103,
      b2: 104,
    };

    const { service, mocks } = await makeService();
    mocks.teamsImport.upsert.mockImplementation((data) =>
      Promise.resolve(
        makeTeamRecord([
          {
            id: eraIdByName[data.name!.toLowerCase()],
            eraId: data.eras?.[0] ?? 0,
          },
        ]),
      ),
    );
    const captured: UpsertMatchEvent[] = [];
    const batch = { pending: [] } as unknown as BatchBuffer<UpsertMatchEvent>;
    mocks.matchEventsImport.createBatch.mockReturnValue(batch);
    mocks.matchEventsImport.addToBatch.mockImplementation((_batch, data) => {
      captured.push(data);
      return Promise.resolve(1);
    });
    mocks.matchEventsImport.flushBatch.mockResolvedValue(0);
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      new Map([
        [
          '32',
          [
            { bblId: PRIMARY, date: new Date(Date.UTC(2016, 8, 25)) },
            { bblId: SECONDARY, date: new Date(Date.UTC(2016, 8, 24)) },
          ],
        ],
      ]),
    );
    // PRIMARY's own events page is missing (e.g. failed to fetch/parse); only
    // SECONDARY's page is present in the map.
    mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
      new Map([[SECONDARY, eventsB]]),
    );
    mocks.matchMerge.resolve.mockResolvedValue({
      primaryBblIdByBblId: new Map([
        [PRIMARY, PRIMARY],
        [SECONDARY, PRIMARY],
      ]),
      partnerBblId: (bblId) =>
        bblId === PRIMARY
          ? SECONDARY
          : bblId === SECONDARY
            ? PRIMARY
            : undefined,
      isPrimary: (bblId) => bblId === PRIMARY,
      isSecondary: (bblId) => bblId === SECONDARY,
      effectivePlayedAt: (_bblId, rawDate) => rawDate,
    });
    mocks.correlation.combineOccurrences.mockReturnValue({
      teamCodes: ['b1', 'b2'],
      actions: [],
      consequences: [],
      journeymenSignings: [],
    });
    mocks.correlation.correlateEvents.mockReturnValue([
      {
        consequenceType: 'miss_next_game',
        consequenceTeamCode: 'b1',
        consequenceSourceBblId: SECONDARY,
        consequencePid: 'victim',
      },
    ]);

    await service.importMatchEvents({
      competitionsByBblId: new Map([
        [
          '32',
          {
            ...competition,
            externalIds: [
              { externalSystemId: BBL_SYSTEM_ID, externalId: '32' },
            ],
          },
        ],
      ]),
      teamsByCode,
      // Both source ids point at the same DB match id, so there IS an
      // imported matchId; only the events data is missing for PRIMARY.
      matchIdsByBblId: new Map([
        [PRIMARY, MATCH_DB_ID],
        [SECONDARY, MATCH_DB_ID],
      ]),
      playerIdsByPid: new Map([['victim', 901]]),
    });

    // Only the present source page is combined; the missing primary page is
    // filtered out rather than passed through as undefined.
    expect(mocks.correlation.combineOccurrences).toHaveBeenCalledWith(eventsB);
    expect(resultArgs(mocks.importResults).errors).toEqual([]);
    // The secondary partner's occurrence must not be silently dropped just
    // because the primary's own events page is missing.
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      matchId: MATCH_DB_ID,
      consequenceType: 'miss_next_game',
      consequenceTeamEraId: 103,
      consequencePlayerId: 901,
    });
    expect(captured[0].actionType).toBeUndefined();
    expect(captured[0].externalIds[0].externalId).toBe(
      '1062-b1-miss-next-game-0',
    );
  });
});
