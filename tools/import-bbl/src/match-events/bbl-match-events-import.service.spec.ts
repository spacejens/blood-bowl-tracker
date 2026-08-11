import type {
  UpsertMatchEvent,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import type {
  BatchBuffer,
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  MatchEventsImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatchEvents } from '../matches/match-events-page-parser';
import type { MatchMergeResolution } from '../matches/match-merge.service';
import { MatchMergeService } from '../matches/match-merge.service';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import { BblMatchEventsImportService } from './bbl-match-events-import.service';
import {
  AWAY_TEAM_ERA_ID,
  awayTeam,
  BBL_SYSTEM_ID,
  competition,
  HOME_TEAM_ERA_ID,
  homeTeam,
  makeEvents,
  makeTeamRecord,
  MATCH_BBL_ID,
  MATCH_DB_ID,
} from './bbl-match-events-import.test-helpers';
import { BblMatchEventsReaderService } from './bbl-match-events-reader.service';
import type {
  CombinedOccurrences,
  EmittedEvent,
} from './match-event-correlation.service';
import { MatchEventCorrelationService } from './match-event-correlation.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

/** A resolution with no merged pairs: every match imports independently. */
function noMergeResolution(): MatchMergeResolution {
  return {
    primaryBblIdByBblId: new Map(),
    partnerBblId: () => undefined,
    isPrimary: () => false,
    isSecondary: () => false,
    effectivePlayedAt: (_bblId, rawDate) => rawDate,
  };
}

/** The default two-team-code combine result used by most single-match tests. */
function defaultCombined(): CombinedOccurrences {
  return {
    teamCodes: ['hme', 'awy'],
    actions: [],
    consequences: [],
    journeymenSignings: [],
  };
}

interface Mocks {
  matchListReader: MockProxy<BblMatchListReaderService>;
  eventsReader: MockProxy<BblMatchEventsReaderService>;
  teamsImport: MockProxy<TeamsImportService>;
  matchEventsImport: MockProxy<MatchEventsImportService>;
  matchMerge: MockProxy<MatchMergeService>;
  correlation: MockProxy<MatchEventCorrelationService>;
  importResults: MockProxy<ImportResultService>;
  upsertFieldNarrowing: MockProxy<UpsertFieldNarrowingService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. `MatchEventCorrelationService.combineOccurrences` and
 * `.correlateEvents` are stubbed to return canned, per-test results (never a
 * copy of the real algorithm) — the algorithm itself has its own dedicated
 * spec (match-event-correlation.service.spec.ts). These tests exercise only
 * what BblMatchEventsImportService does with those correlation results: team
 * era resolution, external id synthesis, player id resolution, and upserts.
 */
async function makeService(): Promise<{
  service: BblMatchEventsImportService;
  mocks: Mocks;
}> {
  const matchListReader = mock<BblMatchListReaderService>();

  const eventsReader = mock<BblMatchEventsReaderService>();

  const teamsImport = mock<TeamsImportService>();

  const matchEventsImport = mock<MatchEventsImportService>();

  const matchMerge = mock<MatchMergeService>();
  matchMerge.resolve.mockResolvedValue(noMergeResolution());

  const correlation = mock<MatchEventCorrelationService>();
  correlation.combineOccurrences.mockReturnValue(defaultCombined());
  correlation.correlateEvents.mockReturnValue([]);

  const importResults = mock<ImportResultService>();
  // `error` is a pure identity field copy with no branching or formatting, so
  // there is no algorithm here that can drift out of sync with the real
  // ImportResultService — exempt from the canned-response rule.
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const upsertFieldNarrowing = mock<UpsertFieldNarrowingService>();
  // Every competition fixture in this spec has a defined eraId, so the mock
  // simply passes it through rather than re-deriving the throw-if-undefined
  // invariant, which is covered by the real service's own spec.
  upsertFieldNarrowing.resolveDefiniteEraId.mockImplementation(
    (c) => c.eraId as number,
  );

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchEventsImportService,
      { provide: BblMatchListReaderService, useValue: matchListReader },
      { provide: BblMatchEventsReaderService, useValue: eventsReader },
      { provide: TeamsImportService, useValue: teamsImport },
      { provide: MatchEventsImportService, useValue: matchEventsImport },
      { provide: MatchMergeService, useValue: matchMerge },
      { provide: MatchEventCorrelationService, useValue: correlation },
      { provide: ImportResultService, useValue: importResults },
      {
        provide: UpsertFieldNarrowingService,
        useValue: upsertFieldNarrowing,
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblMatchEventsImportService),
    mocks: {
      matchListReader,
      eventsReader,
      teamsImport,
      matchEventsImport,
      matchMerge,
      correlation,
      importResults,
      upsertFieldNarrowing,
    },
  };
}

type UpsertTeamImpl = (
  data: UpsertTeam,
) => Promise<ReturnType<typeof makeTeamRecord> | undefined>;

async function runImport(
  events: BblMatchEvents,
  playerIds: Record<string, number> = {},
  overrides: {
    matchIdsByBblId?: Map<string, number>;
    teamsByCode?: Map<string, UpsertTeam>;
    upsertTeam?: UpsertTeamImpl;
    correlatedEvents?: EmittedEvent[];
  } = {},
) {
  const { service, mocks } = await makeService();
  mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
    new Map([['3', [{ bblId: MATCH_BBL_ID, date: new Date(0) }]]]),
  );
  mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
    new Map([[events.bblId, events]]),
  );
  if (overrides.correlatedEvents !== undefined) {
    mocks.correlation.correlateEvents.mockReturnValue(
      overrides.correlatedEvents,
    );
  }

  const captured: UpsertMatchEvent[] = [];
  const batch = { pending: [] } as unknown as BatchBuffer<UpsertMatchEvent>;
  mocks.matchEventsImport.createBatch.mockReturnValue(batch);
  mocks.matchEventsImport.addToBatch.mockImplementation((_batch, data) => {
    captured.push(data);
    return Promise.resolve(1);
  });
  mocks.matchEventsImport.flushBatch.mockResolvedValue(0);
  mocks.teamsImport.upsertTeam.mockImplementation(
    overrides.upsertTeam ??
      ((data) => {
        const id = data.name === 'Home' ? HOME_TEAM_ERA_ID : AWAY_TEAM_ERA_ID;
        return Promise.resolve(
          makeTeamRecord([{ id, eraId: data.eras?.[0] ?? 0 }]),
        );
      }),
  );

  await service.importMatchEvents({
    competitionsByBblId: new Map([['3', competition]]),
    teamsByCode:
      overrides.teamsByCode ??
      new Map([
        ['hme', homeTeam],
        ['awy', awayTeam],
      ]),
    matchIdsByBblId:
      overrides.matchIdsByBblId ?? new Map([[MATCH_BBL_ID, MATCH_DB_ID]]),
    playerIdsByPid: new Map(Object.entries(playerIds)),
  });

  return { captured, resultArgs: resultArgs(mocks.importResults), mocks };
}

function externalIds(captured: UpsertMatchEvent[]): string[] {
  return captured.map((c) => c.externalIds[0].externalId);
}

describe('BblMatchEventsImportService', () => {
  it('scenario 1: a home hattrick yields td-0, td-1, td-2 occurrence ids', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { p1: 11, p2: 12, p3: 13 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p2',
          },
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p3',
          },
        ],
      },
    );

    expect(externalIds(captured)).toEqual([
      '89-hme-td-0',
      '89-hme-td-1',
      '89-hme-td-2',
    ]);
    expect(captured[0]).toMatchObject({
      matchId: MATCH_DB_ID,
      actionType: 'touchdown',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      actingPlayerId: 11,
    });
    expect(captured[0].consequenceType).toBeUndefined();
    expect(captured[2].actingPlayerId).toBe(13);
  });

  it('scenario 2: a merged action+consequence event maps both sides to their team eras and players', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { killer: 7, victim: 8 },
      {
        correlatedEvents: [
          {
            actionType: 'death',
            consequenceType: 'death',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'killer',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: 'victim',
          },
        ],
      },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'death',
      consequenceType: 'death',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      actingPlayerId: 7,
      consequencePlayerId: 8,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-death-0' },
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-death-0' },
      ],
    });
  });

  it('scenario 3: independent action-only and consequence-only events each get their own per-team-and-category counter', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { a1: 1, a2: 2, v1: 3 },
      {
        correlatedEvents: [
          {
            actionType: 'serious_injury',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'a1',
          },
          {
            actionType: 'serious_injury',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'a2',
          },
          {
            consequenceType: 'miss_next_game',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: 'v1',
          },
        ],
      },
    );

    expect(captured).toHaveLength(3);
    // Two action-only serious-injury events on the home side.
    expect(captured[0]).toMatchObject({
      actionType: 'serious_injury',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      actingPlayerId: 1,
    });
    expect(captured[0].consequenceType).toBeUndefined();
    expect(captured[1]).toMatchObject({
      actionType: 'serious_injury',
      actingPlayerId: 2,
    });
    // One consequence-only miss-next-game event on the away side.
    expect(captured[2]).toMatchObject({
      consequenceType: 'miss_next_game',
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      consequencePlayerId: 3,
    });
    expect(captured[2].actionType).toBeUndefined();
    expect(externalIds(captured)).toEqual([
      '89-hme-serious-0',
      '89-hme-serious-1',
      '89-awy-miss-next-game-0',
    ]);
  });

  it('scenario 4: an action-only event maps its team and player, with no consequence fields', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { f1: 5 },
      {
        correlatedEvents: [
          {
            actionType: 'foul',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'f1',
          },
        ],
      },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'foul',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      actingPlayerId: 5,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-foul-0' },
      ],
    });
  });

  it('scenario 5: a consequence-only event with a null pid still gets an external id and no player id', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            consequenceType: 'death',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
          },
        ],
      },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      matchId: MATCH_DB_ID,
      consequenceType: 'death',
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-death-0' },
      ],
    });
    expect(captured[0].consequencePlayerId).toBeUndefined();
  });

  it('records a non-fatal error but still emits the event when a pid has no imported id', async () => {
    const { captured, resultArgs } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'ghost',
          },
        ],
      },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0].actingPlayerId).toBeUndefined();
    expect(captured[0].externalIds[0].externalId).toBe('89-hme-td-0');
    expect(resultArgs.errors.length).toBeGreaterThan(0);
  });

  it('counts each emitted event as imported', async () => {
    const { resultArgs } = await runImport(
      makeEvents({}),
      { p1: 1, p2: 2 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p2',
          },
        ],
      },
    );

    expect(resultArgs.imported).toBe(2);
    expect(resultArgs.errors).toEqual([]);
  });

  it('records an error and skips a match with no imported id', async () => {
    const { captured, resultArgs, mocks } = await runImport(
      makeEvents({}),
      { p1: 1 },
      { matchIdsByBblId: new Map() },
    );

    expect(captured).toHaveLength(0);
    expect(mocks.matchEventsImport.addToBatch).not.toHaveBeenCalled();
    expect(resultArgs.errors).toHaveLength(1);
    expect(resultArgs.errors[0].message).toContain('no imported match id');
    // The match is skipped before correlation is even consulted.
    expect(mocks.correlation.combineOccurrences).not.toHaveBeenCalled();
  });

  it('records an error and skips a match whose team code does not resolve', async () => {
    const { captured, resultArgs, mocks } = await runImport(
      makeEvents({}),
      { p1: 1 },
      { teamsByCode: new Map([['hme', homeTeam]]) },
    );

    expect(captured).toHaveLength(0);
    expect(mocks.matchEventsImport.addToBatch).not.toHaveBeenCalled();
    expect(
      resultArgs.errors.some((e) =>
        e.message.includes('could not resolve all'),
      ),
    ).toBe(true);
    expect(resultArgs.errors.some((e) => e.message.includes('"awy"'))).toBe(
      true,
    );
    // The unresolved team short-circuits before events are correlated.
    expect(mocks.correlation.correlateEvents).not.toHaveBeenCalled();
  });

  it('opens one batch for the run and flushes the trailing chunk once', async () => {
    const { resultArgs, mocks } = await runImport(
      makeEvents({}),
      { p1: 11, p2: 12, p3: 13 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
        ],
      },
    );

    expect(mocks.matchEventsImport.createBatch).toHaveBeenCalledTimes(1);
    expect(mocks.matchEventsImport.flushBatch).toHaveBeenCalledTimes(1);
    expect(mocks.matchEventsImport.flushBatch).toHaveBeenCalledWith(
      mocks.matchEventsImport.createBatch.mock.results[0].value,
    );
    expect(resultArgs.imported).toBeGreaterThan(0);
  });

  it('records an error and skips a match when a team upsert resolves to no era', async () => {
    const { captured, resultArgs } = await runImport(
      makeEvents({}),
      { p1: 1 },
      { upsertTeam: () => Promise.resolve(undefined) },
    );

    expect(captured).toHaveLength(0);
    expect(
      resultArgs.errors.some((e) =>
        e.message.includes('could not resolve all'),
      ),
    ).toBe(true);
  });

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
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
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
      // Both source ids point at the same DB match id, per Task 3.
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
    mocks.teamsImport.upsertTeam.mockImplementation((data) =>
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

  it('emits a journeymen_signings event with the count and team, and no player id for its null pid', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            actionType: 'journeymen_signings',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: null,
            journeymenCount: 2,
          },
        ],
      },
    );

    const journeyman = captured.filter(
      (c) => c.actionType === 'journeymen_signings',
    );
    expect(journeyman).toHaveLength(1);
    expect(journeyman[0]).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'journeymen_signings',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      journeymenCount: 2,
      externalIds: [
        { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-journeyman-0' },
      ],
    });
    expect(journeyman[0].actingPlayerId).toBeUndefined();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service, mocks } = await makeService();
    mocks.matchListReader.getMatchesByCompetitionId.mockResolvedValue(
      new Map([['3', [{ bblId: MATCH_BBL_ID, date: new Date(0) }]]]),
    );
    mocks.eventsReader.getMatchEventsByBblId.mockResolvedValue(
      new Map([[MATCH_BBL_ID, makeEvents({})]]),
    );

    const { result } = await service.importMatchEvents({
      competitionsByBblId: new Map([['3', competition]]),
      teamsByCode: new Map([
        ['hme', homeTeam],
        ['awy', awayTeam],
      ]),
      matchIdsByBblId: new Map([[MATCH_BBL_ID, MATCH_DB_ID]]),
      playerIdsByPid: new Map(),
    });

    expect(result).toBe(CANNED_RESULT);
  });

  it('writes the unidentified kinds and avoided-casualty fields onto the upsert', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            actionType: 'death',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: null,
            actingUnidentifiedKind: 'mercenary_or_star',
          },
          {
            consequenceType: 'casualty_avoided',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
            consequenceUnidentifiedKind: 'journeyman',
            consequenceAvoidedBy: 'apothecary',
            consequenceAvoidedSeverity: 'death',
          },
        ],
      },
    );

    expect(captured[0]).toMatchObject({
      actionType: 'death',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      actingUnidentifiedKind: 'mercenary_or_star',
    });
    expect(captured[1]).toMatchObject({
      consequenceType: 'casualty_avoided',
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      consequenceUnidentifiedKind: 'journeyman',
      consequenceAvoidedBy: 'apothecary',
      consequenceAvoidedSeverity: 'death',
    });
    expect(externalIds(captured)[1]).toBe('89-awy-cas-avoided-0');
  });

  it('emits an external id from each side of a merged avoided casualty', async () => {
    // A merged event carries both actionType and consequenceType, and each
    // side has its own occurrence identity (team, category, index). Both are
    // persisted, action side first, so a re-import whose correlation decision
    // changes can still reconcile the row from either side.
    const { captured } = await runImport(
      makeEvents({}),
      { killer: 11 },
      {
        correlatedEvents: [
          {
            actionType: 'death',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'killer',
            consequenceType: 'casualty_avoided',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
            consequenceAvoidedBy: 'regeneration',
            consequenceAvoidedSeverity: 'death',
          },
        ],
      },
    );

    expect(captured[0]).toMatchObject({
      actionType: 'death',
      consequenceType: 'casualty_avoided',
      consequenceAvoidedBy: 'regeneration',
      consequenceAvoidedSeverity: 'death',
    });
    expect(captured[0].externalIds).toEqual([
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-death-0' },
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-cas-avoided-0' },
    ]);
  });

  it('shares one occurrence counter per team and category across merged and non-merged sides', async () => {
    // The merged event's two sides and the two standalone occurrences all
    // draw from the same `${teamCode}-${category}` counters, in emission
    // order, so indices neither collide nor skip.
    const { captured } = await runImport(
      makeEvents({}),
      {},
      {
        correlatedEvents: [
          {
            actionType: 'casualty',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: null,
            consequenceType: 'casualty',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
          },
          {
            actionType: 'casualty',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: null,
          },
          {
            consequenceType: 'casualty',
            consequenceTeamCode: 'awy',
            consequenceSourceBblId: MATCH_BBL_ID,
            consequencePid: null,
          },
        ],
      },
    );

    expect(captured[0].externalIds).toEqual([
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-cas-0' },
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-cas-0' },
    ]);
    // Action-only: exactly one id, from the next index of the shared counter.
    expect(captured[1].externalIds).toEqual([
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-hme-cas-1' },
    ]);
    // Consequence-only: exactly one id, likewise.
    expect(captured[2].externalIds).toEqual([
      { externalSystemId: BBL_SYSTEM_ID, externalId: '89-awy-cas-1' },
    ]);
  });

  it('omits the unidentified-kind and avoided-casualty fields entirely when the emitted event carries no tags', async () => {
    const { captured } = await runImport(
      makeEvents({}),
      { p1: 11 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
        ],
      },
    );

    expect(captured[0]).not.toHaveProperty('actingUnidentifiedKind');
    expect(captured[0]).not.toHaveProperty('consequenceUnidentifiedKind');
    expect(captured[0]).not.toHaveProperty('consequenceAvoidedBy');
    expect(captured[0]).not.toHaveProperty('consequenceAvoidedSeverity');
  });

  it('reports each parser annotation error as a non-fatal import error', async () => {
    const { resultArgs } = await runImport(
      makeEvents({
        annotationErrors: [
          {
            label: 'Killers',
            side: 'home',
            text: 'victim eaten by the crowd',
            reason: 'unrecognised',
          },
          {
            label: 'Death',
            side: 'away',
            text: 'foul',
            reason: 'misplaced',
          },
        ],
      }),
    );

    expect(resultArgs.errors).toHaveLength(2);
    expect(resultArgs.errors[0].message).toContain('victim eaten by the crowd');
    expect(resultArgs.errors[0].message).toContain('Killers');
    expect(resultArgs.errors[0].message).toContain(
      'the text is not a known annotation',
    );
    expect(resultArgs.errors[1].message).toContain(
      'the annotation cannot apply to this kind of row',
    );
  });

  it('still imports a match whose cells also contain an unusable annotation', async () => {
    const { captured, resultArgs } = await runImport(
      makeEvents({
        annotationErrors: [
          { label: 'Death', side: 'away', text: 'foul', reason: 'misplaced' },
        ],
      }),
      { p1: 11 },
      {
        correlatedEvents: [
          {
            actionType: 'touchdown',
            actingTeamCode: 'hme',
            actingSourceBblId: MATCH_BBL_ID,
            actingPid: 'p1',
          },
        ],
      },
    );

    expect(captured).toHaveLength(1);
    expect(resultArgs.imported).toBe(1);
  });

  it('records no annotation errors for a page that parsed cleanly', async () => {
    const { resultArgs } = await runImport(makeEvents({}));

    expect(resultArgs.errors).toEqual([]);
  });
});
