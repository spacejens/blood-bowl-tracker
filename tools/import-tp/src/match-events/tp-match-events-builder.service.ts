import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpMatchEventBuildersService } from './tp-match-event-builders.service';
import type { CasualtyPairing } from './tp-match-events-correlation.service';

/** One resolved team_eras row: its DB id and the era it belongs to. */
export interface TeamEra {
  id: number;
  eraId: number;
}

interface ResolveTeamEraOptions {
  teamErasByRosterId: Map<number, TeamEra[]>;
  rosterId: number;
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

/**
 * Resolves TP roster/era references and builds `UpsertMatchEvent`(s) for
 * every TP match event kind. The individual `build*Event` implementations
 * live in the injected {@link TpMatchEventBuildersService} — split out
 * purely to stay under this repo's 500-line source file ceiling; from the
 * outside, only `resolveTeamEraId` and `buildEventData` are the public API.
 */
@Injectable()
export class TpMatchEventsBuilderService {
  constructor(private readonly eventBuilders: TpMatchEventBuildersService) {}

  /** Resolve a roster id + era id to its team_eras id, or undefined. */
  resolveTeamEraId(options: ResolveTeamEraOptions): number | undefined {
    return this.eventBuilders.resolveTeamEraId(options);
  }

  /**
   * Build zero or more `UpsertMatchEvent`s for one TP match event. Touchdown,
   * completion, interception, deflection, foul, mvp_award, and
   * successful_landing are all built as simple single-actor action events;
   * sent_off is consequence-side; injury always yields at least a consequence
   * row (including `injuryType: 'None'`, a real Badly Hurt result);
   * casualty_caused yields nothing when it was paired with an injury event via
   * `casualtyPairing` (it's emitted as part of that injury's row instead), or
   * a standalone `'casualty'`-action row otherwise. Every other modeled TP
   * event type is administrative and delegates to
   * {@link TpMatchEventBuildersService.buildAdminEvents}.
   */
  buildEventData(options: BuildEventDataOptions): UpsertMatchEvent[] {
    const { event, casualtyPairing } = options;
    switch (event.type) {
      case 'touchdown':
      case 'completion':
      case 'interception':
      case 'deflection':
      case 'foul':
      case 'successful_landing':
        return this.eventBuilders.buildSimpleActionEvent(
          { ...options, event },
          event.type,
        );
      case 'mvp_award':
        return this.eventBuilders.buildSimpleActionEvent(
          { ...options, event },
          'mvp_award',
        );
      case 'sent_off':
        return this.eventBuilders.buildSentOffEvent({ ...options, event });
      case 'injury':
        return this.eventBuilders.buildInjuryEvent({ ...options, event });
      case 'casualty_caused':
        if (casualtyPairing.pairedCasualtyEventIds.has(event.tpEventId)) {
          return [];
        }
        return this.eventBuilders.buildCasualtyCausedEvent({
          ...options,
          event,
        });
      default:
        return this.eventBuilders.buildAdminEvents({ ...options, event });
    }
  }
}
