import type { ImportError, TeamEra } from '@blood-bowl-tracker/api-contract';
import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';

import type {
  CasualtyPairing,
  FoulPairing,
} from './tp-match-events-correlation.service';

export interface BuildEventDataOptions {
  event: TpMatchEvent;
  matchId: number;
  eraId: number;
  tpSystemId: number;
  teamErasByRosterId: Map<number, TeamEra[]>;
  playerIdsByLineUpId: Map<number, number>;
  homeTeamEraId: number | undefined;
  awayTeamEraId: number | undefined;
  errors: ImportError[];
  /** Casualty/injury pairing for this match — see {@link CasualtyPairing}. */
  casualtyPairing: CasualtyPairing;
  /** Foul/injury pairing for this match — see {@link FoulPairing}. */
  foulPairing: FoulPairing;
}
