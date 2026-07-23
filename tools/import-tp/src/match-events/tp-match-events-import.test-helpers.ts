import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemBootstrapService,
  ImportError,
  MatchEventsImportService,
} from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpMatch, TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
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

export function makeService(upsertMatchEvent: ReturnType<typeof vi.fn>) {
  return new TpMatchEventsImportService(
    { upsertMatchEvent } as unknown as MatchEventsImportService,
    {
      bootstrap: vi.fn().mockResolvedValue({ ok: true, ids: [TP_SYSTEM_ID] }),
    } as unknown as ExternalSystemBootstrapService,
    {
      getTpSystemName: () => 'TP',
    } as unknown as ExternalSystemNameConfigService,
    new TpMatchEventsBuilderService(
      new TpMatchEventKindBuildersService(new ImportResultService()),
    ),
    new TpMatchEventsCorrelationService(),
    new ImportResultService(),
  );
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
