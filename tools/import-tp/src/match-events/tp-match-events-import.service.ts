import type {
  ConsequenceType,
  UpsertMatchEvent,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  MatchEventsImportService,
} from '@blood-bowl-tracker/import';
import type {
  TpInjuryType,
  TpMatch,
  TpMatchEvent,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

/** One resolved team_eras row: its DB id and the era it belongs to. */
interface TeamEra {
  id: number;
  eraId: number;
}

/**
 * Options for {@link TpMatchEventsImportService.importMatchEvents}, bundled
 * into one object to stay within the repo's 3-parameter limit.
 *
 * `matchesByCompetitionId` and `eraIdByCompetitionId` are both keyed by a
 * competition's DB id (not its TP id) — `eraIdByCompetitionId` is the same
 * map `main.ts` already builds (competition DB id -> its real `eraId`, read
 * from `competitionsByTpId`/`competitionIdsByTpId`) for resolving hired
 * star-player team eras, reused here so a roster id spanning multiple eras
 * resolves unambiguously rather than via a name-based guess — exactly the
 * pattern `TpTeamParticipationImportService.resolveTeamEraId` uses.
 */
export interface ImportMatchEventsOptions {
  matchesByCompetitionId: Map<number, TpMatch[]>;
  eraIdByCompetitionId: Map<number, number>;
  matchIdsByTpId: Map<number, number>;
  teamErasByRosterId: Map<number, TeamEra[]>;
  playerIdsByLineUpId: Map<number, number>;
  /**
   * Star players hired via an `inducements_roll` event, keyed by
   * `` `${rosterId}:${lineUpMasterId}` ``. Touchdown/injury events reference
   * players by `lineUpId`, not `lineUpMasterId`, so this is not consulted by
   * {@link TpMatchEventsImportService.resolvePlayer} today; it is accepted
   * here so the caller can pass the same map uniformly and a future event
   * type that does reference a star master can use it without a signature
   * change.
   */
  starPlayerIdsByRosterAndMaster: Map<string, number>;
}

interface ResolveTeamEraOptions {
  teamErasByRosterId: Map<number, TeamEra[]>;
  rosterId: number;
  eraId: number;
}

interface ResolvePlayerOptions {
  lineUpId: number;
  matchId: number;
  playerIdsByLineUpId: Map<number, number>;
  errors: ImportError[];
}

interface BuildEventDataOptions {
  event: TpMatchEvent;
  matchId: number;
  eraId: number;
  tpSystemId: number;
  teamErasByRosterId: Map<number, TeamEra[]>;
  playerIdsByLineUpId: Map<number, number>;
  errors: ImportError[];
}

const INJURY_CONSEQUENCE_BY_TYPE: Record<
  Exclude<TpInjuryType, 'None'>,
  ConsequenceType
> = {
  MissNextGame: 'miss_next_game',
  NigglingInjury: 'niggling_injury',
  Dead: 'death',
  AV: 'stat_reduction_av',
  ST: 'stat_reduction_st',
  MA: 'stat_reduction_ma',
  PA: 'stat_reduction_pa',
  AG: 'stat_reduction_ag',
};

@Injectable()
export class TpMatchEventsImportService {
  constructor(
    private readonly matchEventsImport: MatchEventsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import touchdown and injury/casualty match events from every already
   * parsed TP match. Unlike BBL — which correlates separately scraped action
   * and consequence occurrences — TP embeds the acting/victim player and
   * team directly on each event, so no correlation step is needed.
   *
   * Per competition (iterating `matchesByCompetitionId`, keyed by competition
   * DB id): resolve the competition's real `eraId` via
   * `eraIdByCompetitionId`; a competition whose era can't be resolved is
   * recorded as an error and skipped. Per match: resolve its DB id via
   * `matchIdsByTpId`; a match with no imported id is recorded as an error and
   * skipped. Per event: `touchdown` and `injury` events are mapped to an
   * `UpsertMatchEvent` and upserted (other event types are administrative and
   * handled by a later step, not this one — they fall through to a no-op).
   *
   * A touchdown's `actingTeamEraId` is the scoring roster's team era and its
   * `actingPlayerId` the scorer (`lineUpId`). An injury with `injuryType:
   * 'None'` is skipped (TP reports "no injury" as its own roll); any other
   * `injuryType` maps to a `consequence_type` (see
   * `INJURY_CONSEQUENCE_BY_TYPE`) on the victim (`rosterId`/`lineUpId`). When
   * the injury's `turnRosterId` is present and differs from the victim's
   * roster (an opponent caused it), the event also carries
   * `actingTeamEraId`/`actionType: 'casualty' | 'death'` crediting the
   * causing team; a `turnRosterId` equal to the victim's roster (or absent)
   * means the injury was self-inflicted, so only the consequence side is
   * emitted. Every event's external id is `tp-<tpEventId>`.
   *
   * A roster id that doesn't resolve to a team era under the match's era, or
   * a `lineUpId` with no imported player id, is recorded as a non-fatal error
   * but does not stop the event's own upsert (the field is simply omitted).
   * Idempotent.
   */
  async importMatchEvents(
    options: ImportMatchEventsOptions,
  ): Promise<{ result: ImportResult }> {
    const {
      matchesByCompetitionId,
      eraIdByCompetitionId,
      matchIdsByTpId,
      teamErasByRosterId,
      playerIdsByLineUpId,
    } = options;
    let imported = 0;
    const errors: ImportError[] = [];

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      tpSystemName,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: makeImportResult({ imported, errors }) };
    }
    const [tpSystemId] = bootstrap.ids;

    for (const [competitionId, matches] of matchesByCompetitionId) {
      const eraId = eraIdByCompetitionId.get(competitionId);
      if (eraId === undefined) {
        errors.push(
          makeImportError({
            item: { competitionId },
            message: `Skipping match events for competition "${competitionId}": could not resolve its era.`,
          }),
        );
        continue;
      }

      for (const match of matches) {
        const matchId = matchIdsByTpId.get(match.id);
        if (matchId === undefined) {
          errors.push(
            makeImportError({
              item: { match: match.id },
              message: `Skipping match events for match "${match.id}": it has no imported match id.`,
            }),
          );
          continue;
        }

        for (const event of match.matchEvents) {
          const data = this.buildEventData({
            event,
            matchId,
            eraId,
            tpSystemId,
            teamErasByRosterId,
            playerIdsByLineUpId,
            errors,
          });
          if (!data) {
            continue;
          }
          if (await this.matchEventsImport.upsertMatchEvent(data, errors)) {
            imported += 1;
          }
        }
      }
    }

    return { result: makeImportResult({ imported, errors }) };
  }

  /**
   * Build the `UpsertMatchEvent` for one TP match event, or `undefined` when
   * the event type is administrative (Task 9) or an injury reports
   * `injuryType: 'None'`.
   */
  private buildEventData(
    options: BuildEventDataOptions,
  ): UpsertMatchEvent | undefined {
    const {
      event,
      matchId,
      eraId,
      tpSystemId,
      teamErasByRosterId,
      playerIdsByLineUpId,
      errors,
    } = options;

    switch (event.type) {
      case 'touchdown': {
        const data: UpsertMatchEvent = {
          matchId,
          actionType: 'touchdown',
          externalIds: [
            {
              externalSystemId: tpSystemId,
              externalId: `tp-${event.tpEventId}`,
            },
          ],
        };
        const actingTeamEraId = this.resolveTeamEraId({
          teamErasByRosterId,
          rosterId: event.rosterId,
          eraId,
        });
        if (actingTeamEraId !== undefined) {
          data.actingTeamEraId = actingTeamEraId;
        }
        const actingPlayerId = this.resolvePlayer({
          lineUpId: event.lineUpId,
          matchId,
          playerIdsByLineUpId,
          errors,
        });
        if (actingPlayerId !== undefined) {
          data.actingPlayerId = actingPlayerId;
        }
        return data;
      }
      case 'injury': {
        const consequenceType = this.injuryConsequence(event.injuryType);
        if (consequenceType === undefined) {
          return undefined;
        }
        const data: UpsertMatchEvent = {
          matchId,
          consequenceType,
          externalIds: [
            {
              externalSystemId: tpSystemId,
              externalId: `tp-${event.tpEventId}`,
            },
          ],
        };
        const consequenceTeamEraId = this.resolveTeamEraId({
          teamErasByRosterId,
          rosterId: event.rosterId,
          eraId,
        });
        if (consequenceTeamEraId !== undefined) {
          data.consequenceTeamEraId = consequenceTeamEraId;
        }
        const consequencePlayerId = this.resolvePlayer({
          lineUpId: event.lineUpId,
          matchId,
          playerIdsByLineUpId,
          errors,
        });
        if (consequencePlayerId !== undefined) {
          data.consequencePlayerId = consequencePlayerId;
        }
        if (
          event.turnRosterId !== undefined &&
          event.turnRosterId !== event.rosterId
        ) {
          data.actionType = event.injuryType === 'Dead' ? 'death' : 'casualty';
          const actingTeamEraId = this.resolveTeamEraId({
            teamErasByRosterId,
            rosterId: event.turnRosterId,
            eraId,
          });
          if (actingTeamEraId !== undefined) {
            data.actingTeamEraId = actingTeamEraId;
          }
        }
        return data;
      }
      default:
        return undefined;
    }
  }

  /** Resolve a roster id + era id to its team_eras id, or undefined. */
  private resolveTeamEraId(options: ResolveTeamEraOptions): number | undefined {
    return options.teamErasByRosterId
      .get(options.rosterId)
      ?.find((teamEra) => teamEra.eraId === options.eraId)?.id;
  }

  /**
   * Resolve a `lineUpId` to its imported player DB id. A `lineUpId` with no
   * imported id yields `undefined` and records a non-fatal error so the event
   * is still emitted with a null player, mirroring BBL's `resolvePlayerId`.
   */
  private resolvePlayer(options: ResolvePlayerOptions): number | undefined {
    const { lineUpId, matchId, playerIdsByLineUpId, errors } = options;
    const id = playerIdsByLineUpId.get(lineUpId);
    if (id === undefined) {
      errors.push(
        makeImportError({
          item: { match: matchId, lineUpId },
          message: `Player lineUpId "${lineUpId}" in match "${matchId}" has no imported id; emitting the event with a null player.`,
        }),
      );
      return undefined;
    }
    return id;
  }

  /**
   * Map a TP `injuryType` to its `consequence_type`, or `undefined` for
   * `'None'` (no injury occurred).
   */
  private injuryConsequence(
    injuryType: TpInjuryType,
  ): ConsequenceType | undefined {
    if (injuryType === 'None') {
      return undefined;
    }
    return INJURY_CONSEQUENCE_BY_TYPE[injuryType];
  }
}
