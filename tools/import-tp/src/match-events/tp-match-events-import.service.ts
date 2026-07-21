import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  MatchEventsImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TeamEra } from './tp-match-events-builders';
import { buildEventData, resolveTeamEraId } from './tp-match-events-builders';

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

@Injectable()
export class TpMatchEventsImportService {
  constructor(
    private readonly matchEventsImport: MatchEventsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import touchdown, mvp_award, injury/casualty, and administrative match
   * events from every already parsed TP match. Unlike BBL — which correlates
   * separately scraped action and consequence occurrences — TP embeds the
   * acting/victim player and team directly on each event, so no correlation
   * step is needed.
   *
   * Per competition (iterating `matchesByCompetitionId`, keyed by competition
   * DB id): resolve the competition's real `eraId` via
   * `eraIdByCompetitionId`; a competition whose era can't be resolved is
   * recorded as an error and skipped. Per match: resolve its DB id via
   * `matchIdsByTpId`; a match with no imported id is recorded as an error and
   * skipped. Also resolve the match's home/away team eras (via
   * `match.homeTeamTpId`/`awayTeamTpId` + the competition's era, same
   * pattern as `TpTeamParticipationImportService.resolveTeamEraId`) for the
   * "both-sides" administrative events (winnings, fan factor, dedicated
   * fans) and concession, which need a specific side without an acting
   * roster id on the event itself. Per event: `buildEventData` (see
   * `tp-match-events-builders.ts`) maps the event to zero, one, or two
   * `UpsertMatchEvent`s, each of which is upserted.
   *
   * A touchdown's `actingTeamEraId` is the scoring roster's team era and its
   * `actingPlayerId` the scorer (`lineUpId`); an mvp_award is resolved the
   * same way, crediting the awarded player and their team. An injury with
   * `injuryType: 'None'` is skipped (TP reports "no injury" as its own
   * roll); any other
   * `injuryType` maps to a `consequence_type` on the victim
   * (`rosterId`/`lineUpId`). When the injury's `turnRosterId` is present and
   * differs from the victim's roster (an opponent caused it), the event also
   * carries `actingTeamEraId`/`actionType: 'casualty' | 'death'` crediting
   * the causing team; a `turnRosterId` equal to the victim's roster (or
   * absent) means the injury was self-inflicted, so only the consequence
   * side is emitted.
   *
   * Administrative events (weather, inducements, winnings, fan factor,
   * journeyman signing, expensive mistake, dedicated fans, secret objective,
   * prayers to Nuffle, concession) each set exactly one typed payload column
   * and use the team scope from the Task 9 mapping table; "both-sides"
   * events emit two records with `-home`/`-away` suffixed external ids.
   * Every event's external id is `tp-<tpEventId>` (or its suffixed variant).
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

        const homeTeamEraId = resolveTeamEraId({
          teamErasByRosterId,
          rosterId: match.homeTeamTpId,
          eraId,
        });
        const awayTeamEraId = resolveTeamEraId({
          teamErasByRosterId,
          rosterId: match.awayTeamTpId,
          eraId,
        });

        for (const event of match.matchEvents) {
          const dataList = buildEventData({
            event,
            matchId,
            eraId,
            tpSystemId,
            teamErasByRosterId,
            playerIdsByLineUpId,
            homeTeamEraId,
            awayTeamEraId,
            errors,
          });
          for (const data of dataList) {
            if (await this.matchEventsImport.upsertMatchEvent(data, errors)) {
              imported += 1;
            }
          }
        }
      }
    }

    return { result: makeImportResult({ imported, errors }) };
  }
}
