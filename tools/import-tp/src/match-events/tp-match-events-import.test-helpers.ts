import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchEventsImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch, TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpMatchEventsBuilderService } from './tp-match-events-builder.service';
import type { BuildEventDataOptions } from './tp-match-events-builder.types';
import type {
  CasualtyPairing,
  FoulPairing,
} from './tp-match-events-correlation.service';
import { TpMatchEventsCorrelationService } from './tp-match-events-correlation.service';
import { TpMatchEventsImportService } from './tp-match-events-import.service';

/**
 * Shared fixtures and helpers for `tp-match-events-import.service.spec.ts`.
 */

export const TP_SYSTEM_ID = 1;
export const COMPETITION_DB_ID = 900;
export const MATCH_DB_ID = 7;
export const HOME_TEAM_ERA_ID = 501;
export const AWAY_TEAM_ERA_ID = 502;
export const HOME_PLAYER_ID = 8001;
export const AWAY_PLAYER_ID = 8002;
export const HOME_ROSTER_ID = 164868;
export const AWAY_ROSTER_ID = 167242;
export const ERA_ID = 500;

export function matchWithEvents(options: {
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

interface MakeServiceOptions {
  /** Override for a failed external-system bootstrap (defaults to success). */
  bootstrapResult?: Awaited<
    ReturnType<ExternalSystemBootstrapService['bootstrap']>
  >;
  /** Canned `correlateCasualties` result (defaults to "nothing paired"). */
  correlationResult?: CasualtyPairing;
  /** Canned `correlateFouls` result (defaults to "nothing paired"). */
  foulCorrelationResult?: FoulPairing;
  /**
   * Override for the mocked `TpMatchEventsBuilderService.buildEventData`
   * (defaults to {@link syntheticBuildEventData}). Supply this to control
   * how many `UpsertMatchEvent`s each event yields, or to push an error
   * onto the shared `errors` array.
   */
  buildEventData?: TpMatchEventsBuilderService['buildEventData'];
}

interface RunImportOptions extends MakeServiceOptions {
  matches: TpMatch[];
}

function emptyCasualtyPairing(): CasualtyPairing {
  return {
    casualtyByInjuryEventId: new Map(),
    pairedCasualtyEventIds: new Set(),
  };
}

function emptyFoulPairing(): FoulPairing {
  return { foulByInjuryEventId: new Map(), pairedFoulEventIds: new Set() };
}

/**
 * A `MockProxy<TpMatchEventsCorrelationService>` whose `correlateCasualties`
 * returns a caller-supplied, canned `CasualtyPairing` — never a
 * recomputation of the real pairing algorithm (that's
 * `TpMatchEventsCorrelationService`'s own job, covered by its dedicated
 * spec). Defaults to "nothing paired" when the caller doesn't need pairing.
 */
function mockTpMatchEventsCorrelationService(
  correlationResult: CasualtyPairing,
  foulCorrelationResult: FoulPairing,
): MockProxy<TpMatchEventsCorrelationService> {
  const correlation = mock<TpMatchEventsCorrelationService>();
  correlation.correlateCasualties.mockReturnValue(correlationResult);
  correlation.correlateFouls.mockReturnValue(foulCorrelationResult);
  return correlation;
}

/**
 * The default canned `buildEventData` response: one synthetic
 * `UpsertMatchEvent` per call, whose external id is derived from the
 * event's `tpEventId` so a test can tell which event produced it. The
 * `actionType` is an arbitrary placeholder —
 * `TpMatchEventsImportService` never inspects the built event, it only
 * forwards it to `MatchEventsImportService.upsertMatchEvent`. This is a
 * canned response, NOT a reimplementation of the real per-kind
 * construction logic (that lives in `TpMatchEventKindBuildersService` and
 * is covered by its own dedicated specs).
 */
function syntheticBuildEventData(
  options: BuildEventDataOptions,
): UpsertMatchEvent[] {
  return [
    {
      matchId: options.matchId,
      actionType: 'touchdown',
      externalIds: [
        {
          externalSystemId: options.tpSystemId,
          externalId: `tp-${options.event.tpEventId}`,
        },
      ],
    },
  ];
}

/**
 * A `MockProxy<TpMatchEventsBuilderService>` returning canned responses:
 * `resolveTeamEraId` answers for the two roster ids these tests use and
 * `undefined` for anything else, and `buildEventData` returns one synthetic
 * event per call. Neither reimplements the real logic — the real
 * array-scanning resolution and per-kind construction belong to
 * `TpMatchEventKindBuildersService`, and the dispatch belongs to
 * `TpMatchEventsBuilderService`; both have their own dedicated specs
 * (`tp-match-events-builder.service.spec.ts`,
 * `tp-match-event-kind-builders-gameplay.spec.ts`,
 * `tp-match-event-kind-builders-admin.spec.ts`).
 */
function mockTpMatchEventsBuilderService(
  buildEventData: TpMatchEventsBuilderService['buildEventData'],
): MockProxy<TpMatchEventsBuilderService> {
  const eventsBuilder = mock<TpMatchEventsBuilderService>();
  eventsBuilder.resolveTeamEraId.mockImplementation(({ rosterId }) => {
    if (rosterId === HOME_ROSTER_ID) return HOME_TEAM_ERA_ID;
    if (rosterId === AWAY_ROSTER_ID) return AWAY_TEAM_ERA_ID;
    return undefined;
  });
  eventsBuilder.buildEventData.mockImplementation(buildEventData);
  return eventsBuilder;
}

/**
 * `mockImportResultService()` only provides the exempt `error` identity
 * mock; `result()` is stubbed here to return a fixed `CANNED_RESULT` rather
 * than recomputing the real `success` derivation — a mock must return the
 * canned response a test expects, not reimplement the collaborator's own
 * logic (that derivation is `ImportResultService`'s own job, covered by its
 * dedicated spec). Callers that need the errors `TpMatchEventsImportService`
 * actually collected use `resultArgs()` to read them back from the recorded
 * `result()` call arguments instead of trusting the canned return value.
 */
export const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

export function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

export async function makeService(
  upsertMatchEvent: ReturnType<typeof vi.fn>,
  options?: MakeServiceOptions,
): Promise<{
  service: TpMatchEventsImportService;
  importResults: MockProxy<ImportResultService>;
  eventsBuilder: MockProxy<TpMatchEventsBuilderService>;
}> {
  const matchEventsImport = mock<MatchEventsImportService>();
  matchEventsImport.upsertMatchEvent.mockImplementation(
    upsertMatchEvent as MatchEventsImportService['upsertMatchEvent'],
  );
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockResolvedValue(
    options?.bootstrapResult ?? { ok: true, ids: [TP_SYSTEM_ID] },
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockReturnValue('TP');
  const eventsCorrelation = mockTpMatchEventsCorrelationService(
    options?.correlationResult ?? emptyCasualtyPairing(),
    options?.foulCorrelationResult ?? emptyFoulPairing(),
  );
  const eventsBuilder = mockTpMatchEventsBuilderService(
    options?.buildEventData ?? syntheticBuildEventData,
  );
  const importResults = mockImportResultService();
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpMatchEventsImportService,
      { provide: TpMatchEventsBuilderService, useValue: eventsBuilder },
      {
        provide: TpMatchEventsCorrelationService,
        useValue: eventsCorrelation,
      },
      { provide: ImportResultService, useValue: importResults },
      { provide: MatchEventsImportService, useValue: matchEventsImport },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpMatchEventsImportService),
    importResults,
    eventsBuilder,
  };
}

export async function runImportRaw({
  matches,
  ...serviceOptions
}: RunImportOptions): Promise<{
  captured: UpsertMatchEvent[];
  errors: ImportError[];
  eventsBuilder: MockProxy<TpMatchEventsBuilderService>;
}> {
  const captured: UpsertMatchEvent[] = [];
  const upsertMatchEvent = vi.fn(
    (data: UpsertMatchEvent, errors: ImportError[]) => {
      void errors;
      captured.push(data);
      return Promise.resolve(true);
    },
  );
  const { service, importResults, eventsBuilder } = await makeService(
    upsertMatchEvent,
    serviceOptions,
  );

  await service.importMatchEvents({
    matchesByCompetitionId: new Map([[COMPETITION_DB_ID, matches]]),
    eraIdByCompetitionId: new Map([[COMPETITION_DB_ID, ERA_ID]]),
    matchIdsByTpId: new Map([[566088, MATCH_DB_ID]]),
    teamErasByRosterId: new Map([
      [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID }]],
      [AWAY_ROSTER_ID, [{ id: AWAY_TEAM_ERA_ID, eraId: ERA_ID }]],
    ]),
    playerIdsByLineUpId: new Map([
      [2442075, HOME_PLAYER_ID],
      [2459782, AWAY_PLAYER_ID],
    ]),
    starPlayerIdsByRosterAndMaster: new Map(),
  });

  return {
    captured,
    errors: resultArgs(importResults).errors,
    eventsBuilder,
  };
}

export async function runImport(
  options: RunImportOptions,
): Promise<UpsertMatchEvent[]> {
  const { captured } = await runImportRaw(options);
  return captured;
}
