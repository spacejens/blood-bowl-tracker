import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchEventsImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch, TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpMatchEventKindBuildersService } from './tp-match-event-kind-builders.service';
import { TpMatchEventsBuilderService } from './tp-match-events-builder.service';
import { TpMatchEventsCorrelationService } from './tp-match-events-correlation.service';
import { TpMatchEventsImportService } from './tp-match-events-import.service';

/**
 * Shared fixtures and helpers for `tp-match-events-import.service.spec.ts`
 * and `tp-match-events-gameplay.spec.ts` — split by functionality under
 * test (administrative events + error handling vs. gameplay events) to stay
 * under the repo's 1000-line spec file ceiling.
 */

export const TP_SYSTEM_ID = 1;
export const COMPETITION_DB_ID = 900;
export const MATCH_DB_ID = 7;
export const HOME_TEAM_ERA_ID = 501;
export const AWAY_TEAM_ERA_ID = 502;
export const SCORER_PLAYER_ID = 8001;
export const VICTIM_PLAYER_ID = 8002;
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

interface RunImportOptions {
  matches: TpMatch[];
}

/**
 * `TpMatchEventsImportService` is built through a real `Test.
 * createTestingModule`, but — deliberately, unlike every other migrated spec
 * in this workspace — `TpMatchEventsBuilderService`,
 * `TpMatchEventKindBuildersService`, `TpMatchEventsCorrelationService` and
 * `ImportResultService` are registered as REAL providers, not mocks.
 *
 * Reason: `TpMatchEventsBuilderService` and `TpMatchEventKindBuildersService`
 * (the per-event-kind construction logic — touchdown, mvp_award, sent_off,
 * injury/casualty pairing, every administrative event) have NO dedicated spec
 * of their own anywhere in this workspace; their only coverage comes
 * incidentally through this shared helper, consumed by both this file's
 * `tp-match-events-import.service.spec.ts` (administrative events/error
 * handling) and the sibling `tp-match-events-gameplay.spec.ts` (gameplay
 * events) — which is explicitly OUT of scope for this migration task (it has
 * no direct `new XService(...)` call of its own to convert). Mocking these
 * collaborators here would silently drop their only coverage and would also
 * require rewriting `tp-match-events-gameplay.spec.ts`'s ~30 gameplay-event
 * assertions to work off canned mock return values instead of exercising the
 * real per-event-kind logic they exist to test — out of scope for a
 * test-setup-only migration. Per the migration conventions' remedy for this
 * exact situation ("if mocking would drop a collaborator's coverage, add a
 * dedicated spec instead"), the correct long-term fix is a dedicated spec for
 * `TpMatchEventKindBuildersService`/`TpMatchEventsBuilderService` — flagged
 * as a follow-up in this task's report, not attempted here.
 * `TpMatchEventsCorrelationService` and `ImportResultService` are kept real
 * alongside them for the same reason: they are its real, already-migrated
 * (Task 12) collaborators, and Nest's DI wires the whole chain exactly as
 * production does. Only the three genuine external-boundary collaborators —
 * `MatchEventsImportService` (the `@blood-bowl-tracker/import` upsert
 * boundary), `ExternalSystemBootstrapService` and
 * `ExternalSystemNameConfigService` — are mocked.
 */
export async function makeService(
  upsertMatchEvent: ReturnType<typeof vi.fn>,
  options?: {
    /** Override for a failed external-system bootstrap (defaults to success). */
    bootstrapResult?: Awaited<
      ReturnType<ExternalSystemBootstrapService['bootstrap']>
    >;
  },
): Promise<TpMatchEventsImportService> {
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

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpMatchEventsImportService,
      TpMatchEventsBuilderService,
      TpMatchEventKindBuildersService,
      TpMatchEventsCorrelationService,
      ImportResultService,
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
  return moduleRef.get(TpMatchEventsImportService);
}

export async function runImportRaw({ matches }: RunImportOptions): Promise<{
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
  const service = await makeService(upsertMatchEvent);

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

export async function runImport(
  options: RunImportOptions,
): Promise<UpsertMatchEvent[]> {
  const { captured } = await runImportRaw(options);
  return captured;
}

export async function runImportWithErrors(
  options: RunImportOptions,
): Promise<{ captured: UpsertMatchEvent[]; errors: ImportError[] }> {
  return runImportRaw(options);
}
