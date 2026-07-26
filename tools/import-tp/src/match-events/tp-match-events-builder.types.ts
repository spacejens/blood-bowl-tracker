import type { ImportError } from '@blood-bowl-tracker/import';
import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';

import type { CasualtyPairing } from './tp-match-events-correlation.service';

/** One resolved team_eras row: its DB id and the era it belongs to. */
export interface TeamEra {
  id: number;
  eraId: number;
}

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
}
