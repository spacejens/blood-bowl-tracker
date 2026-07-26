import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';

import { mockImportResultService } from '../import-package.test-helpers';
import { TpMatchEventKindBuildersService } from './tp-match-event-kind-builders.service';
import type { BuildEventDataOptions } from './tp-match-events-builder.types';
import type {
  CasualtyPairing,
  FoulPairing,
} from './tp-match-events-correlation.service';

/**
 * Shared fixtures for `tp-match-event-kind-builders-gameplay.spec.ts` and
 * `tp-match-event-kind-builders-admin.spec.ts` — split by functionality
 * under test (gameplay events vs. administrative events) to stay under the
 * repo's 1000-line spec file ceiling.
 */

export const TP_SYSTEM_ID = 1;
export const MATCH_DB_ID = 7;
export const ERA_ID = 500;
export const HOME_ROSTER_ID = 164868;
export const AWAY_ROSTER_ID = 167242;
export const HOME_TEAM_ERA_ID = 501;
export const AWAY_TEAM_ERA_ID = 502;
export const ACTOR_LINE_UP_ID = 2442075;
export const VICTIM_LINE_UP_ID = 2459782;
export const ACTOR_PLAYER_ID = 8001;
export const VICTIM_PLAYER_ID = 8002;
/** A roster id deliberately absent from `teamErasByRosterId`. */
export const UNKNOWN_ROSTER_ID = 999999;
/** A lineUpId deliberately absent from `playerIdsByLineUpId`. */
export const UNKNOWN_LINE_UP_ID = 888888;

/**
 * Compile a fresh testing module with `TpMatchEventKindBuildersService` as
 * the only real provider; its sole dependency `ImportResultService` is the
 * standard `mockImportResultService()` mock (its pure item/message
 * construction is covered by its own package's spec).
 */
export async function makeKindBuilders(): Promise<TpMatchEventKindBuildersService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpMatchEventKindBuildersService,
      { provide: ImportResultService, useValue: mockImportResultService() },
    ],
  }).compile();
  return moduleRef.get(TpMatchEventKindBuildersService);
}

/** "Nothing paired" — the default for every test that isn't about pairing. */
function emptyCasualtyPairing(): CasualtyPairing {
  return {
    casualtyByInjuryEventId: new Map(),
    pairedCasualtyEventIds: new Set(),
  };
}

/** "Nothing paired" — the default for every test that isn't about foul pairing. */
function emptyFoulPairing(): FoulPairing {
  return { foulByInjuryEventId: new Map(), pairedFoulEventIds: new Set() };
}

/**
 * Build a `BuildEventDataOptions` around one event, narrowed to that
 * event's own variant so the per-kind `build*Event` signatures accept it.
 * Both known rosters resolve to their team era under `ERA_ID`, and both
 * known lineUpIds resolve to a player id; `UNKNOWN_ROSTER_ID` and
 * `UNKNOWN_LINE_UP_ID` deliberately do not.
 */
export function buildOptions<E extends TpMatchEvent>(options: {
  event: E;
  errors?: ImportError[];
  casualtyPairing?: CasualtyPairing;
  foulPairing?: FoulPairing;
}): BuildEventDataOptions & { event: E } {
  return {
    event: options.event,
    matchId: MATCH_DB_ID,
    eraId: ERA_ID,
    tpSystemId: TP_SYSTEM_ID,
    teamErasByRosterId: new Map([
      [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID }]],
      [AWAY_ROSTER_ID, [{ id: AWAY_TEAM_ERA_ID, eraId: ERA_ID }]],
    ]),
    playerIdsByLineUpId: new Map([
      [ACTOR_LINE_UP_ID, ACTOR_PLAYER_ID],
      [VICTIM_LINE_UP_ID, VICTIM_PLAYER_ID],
    ]),
    homeTeamEraId: HOME_TEAM_ERA_ID,
    awayTeamEraId: AWAY_TEAM_ERA_ID,
    errors: options.errors ?? [],
    casualtyPairing: options.casualtyPairing ?? emptyCasualtyPairing(),
    foulPairing: options.foulPairing ?? emptyFoulPairing(),
  };
}
