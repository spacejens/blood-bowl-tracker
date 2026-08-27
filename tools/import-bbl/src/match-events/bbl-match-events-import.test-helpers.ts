import type {
  UpsertCompetition,
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
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatchEvents } from '../matches/match-events-page-parser';
import type { MatchMergeResolution } from '../matches/match-merge.service';
import { MatchMergeService } from '../matches/match-merge.service';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import { BblMatchEventsImportService } from './bbl-match-events-import.service';
import { BblMatchEventsReaderService } from './bbl-match-events-reader.service';
import type {
  CombinedOccurrences,
  EmittedEvent,
} from './match-event-correlation.service';
import { MatchEventCorrelationService } from './match-event-correlation.service';

export const MATCH_BBL_ID = '89';
export const MATCH_DB_ID = 42;
export const HOME_TEAM_ERA_ID = 1000;
export const AWAY_TEAM_ERA_ID = 2000;
export const BBL_SYSTEM_ID = 1;

/**
 * Test-only helper. Do not import from production code.
 *
 * Fixture data shared across the match-events-import specs.
 */
export const competition: UpsertCompetition = {
  name: 'Major Season 3',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [{ externalSystemId: BBL_SYSTEM_ID, externalId: '3' }],
};

export const homeTeam: UpsertTeam = {
  name: 'Home',
  raceId: 70,
  coachId: 9,
  eras: [],
  externalIds: [],
};
export const awayTeam: UpsertTeam = {
  name: 'Away',
  raceId: 71,
  coachId: 10,
  eras: [],
  externalIds: [],
};

/**
 * Test-only helper. Do not import from production code.
 */
export function makeEvents(
  parts: Partial<
    Pick<
      BblMatchEvents,
      'actions' | 'consequences' | 'journeymenCount' | 'annotationErrors'
    >
  >,
): BblMatchEvents {
  return {
    bblId: MATCH_BBL_ID,
    homeTeamId: 'hme',
    awayTeamId: 'awy',
    actions: parts.actions ?? [],
    consequences: parts.consequences ?? [],
    journeymenCount: parts.journeymenCount,
    annotationErrors: parts.annotationErrors,
  };
}

/**
 * Test-only helper. Do not import from production code.
 *
 * The full upsert result record (TeamsImportService.upsert resolves
 * the API's Team + created shape). The subject under test only reads `.eras`,
 * so the other fields are unremarkable defaults.
 */
export function makeTeamRecord(eras: { id: number; eraId: number }[]) {
  return {
    id: 1,
    name: 'Team',
    raceId: 1,
    coachId: 1,
    eras,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/**
 * Test-only helper. Do not import from production code.
 *
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; the specs
 * assert what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
export const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/**
 * Test-only helper. Do not import from production code.
 *
 * The `{ imported, errors }` the service under test handed to
 * ImportResultService.result.
 */
export function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

/**
 * Test-only helper. Do not import from production code.
 *
 * A resolution with no merged pairs: every match imports independently.
 */
function noMergeResolution(): MatchMergeResolution {
  return {
    primaryBblIdByBblId: new Map(),
    partnerBblId: () => undefined,
    isPrimary: () => false,
    isSecondary: () => false,
    effectivePlayedAt: (_bblId, rawDate) => rawDate,
  };
}

/**
 * Test-only helper. Do not import from production code.
 *
 * The default two-team-code combine result used by most single-match tests.
 */
function defaultCombined(): CombinedOccurrences {
  return {
    teamCodes: ['hme', 'awy'],
    actions: [],
    consequences: [],
    journeymenSignings: [],
  };
}

export interface Mocks {
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
 * Test-only helper. Do not import from production code.
 *
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. `MatchEventCorrelationService.combineOccurrences` and
 * `.correlateEvents` are stubbed to return canned, per-test results (never a
 * copy of the real algorithm) — the algorithm itself has its own dedicated
 * spec (match-event-correlation.service.spec.ts). These tests exercise only
 * what BblMatchEventsImportService does with those correlation results: team
 * era resolution, external id synthesis, player id resolution, and upserts.
 */
export async function makeService(): Promise<{
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

export type UpsertTeamImpl = (
  data: UpsertTeam,
) => Promise<ReturnType<typeof makeTeamRecord> | undefined>;

/**
 * Test-only helper. Do not import from production code.
 *
 * Runs `BblMatchEventsImportService.importMatchEvents` for a single-match,
 * non-merged scenario with every collaborator's default wiring, capturing
 * every `UpsertMatchEvent` passed to `addToBatch`.
 */
export async function runImport(
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
  mocks.teamsImport.upsert.mockImplementation(
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

/**
 * Test-only helper. Do not import from production code.
 */
export function externalIds(captured: UpsertMatchEvent[]): string[] {
  return captured.map((c) => c.externalIds[0].externalId);
}
