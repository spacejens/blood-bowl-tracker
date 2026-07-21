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
import { correlateCasualties } from './tp-match-events-correlation';

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
   * Import touchdown, mvp_award, the other simple action events (completion,
   * interception, deflection, foul, successful_landing), sent_off,
   * injury/casualty, and administrative match events from every already
   * parsed TP match. Unlike BBL — which correlates separately scraped action
   * and consequence occurrences — TP embeds the acting/victim player and
   * team directly on each event for every kind EXCEPT casualties: a code-6
   * (`casualty_caused`, the action) and its code-8 (`injury`, the
   * consequence) are logged as two independent events with no shared id, so
   * they need their own correlation step (`correlateCasualties`, computed
   * once per match — see `tp-match-events-correlation.ts` for why, and its
   * turnNumber-based, order-independent pairing design).
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
   * roster id on the event itself, and compute `casualtyPairing` once for
   * the match. Per event: `buildEventData` (see `tp-match-events-builders.ts`)
   * maps the event to zero, one, or two `UpsertMatchEvent`s, each of which is
   * upserted.
   *
   * A touchdown's `actingTeamEraId` is the scoring roster's team era and its
   * `actingPlayerId` the scorer (`lineUpId`); mvp_award, completion,
   * interception, deflection, foul, and successful_landing are all resolved
   * the same way, crediting the acting player and their team. sent_off is
   * consequence-side, crediting the sent-off player and their team.
   *
   * An injury always emits at least a `consequence_type` row on the victim
   * (`rosterId`/`lineUpId`) — including `injuryType: 'None'`, a real Badly
   * Hurt result (previously, incorrectly, skipped entirely). Its action side
   * is credited from `casualtyPairing` when a specific code-6 was correlated
   * to it (the specific acting player + team, severity-bucketed into
   * `badly_hurt`/`serious_injury`/`death`); otherwise, when `turnRosterId`
   * is present and differs from the victim's roster, team-only credit at the
   * same severity bucket (an opponent-caused injury TP's pairing couldn't
   * pin to a specific player); otherwise consequence-only (self-inflicted or
   * unattributable — a player falling on their own, or a random event). A
   * `casualty_caused` event that WAS paired into its injury's row is not
   * also emitted standalone; an unpaired one (e.g. an apothecary erased the
   * casualty, so no injury exists) emits a standalone `'casualty'`-action row
   * crediting the specific acting player, with unknown severity.
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
      { name: tpSystemName, isBookkeeping: false },
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
        const casualtyPairing = correlateCasualties(match.matchEvents);

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
            casualtyPairing,
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
