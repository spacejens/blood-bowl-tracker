import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchEventsImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpMatchEventsBuilderService } from './tp-match-events-builder.service';
import type { TeamEra } from './tp-match-events-builder.types';
import { TpMatchEventsCorrelationService } from './tp-match-events-correlation.service';

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
    private readonly eventsBuilder: TpMatchEventsBuilderService,
    private readonly eventsCorrelation: TpMatchEventsCorrelationService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * TP embeds the acting/victim player and team directly on every
   * attribution-bearing gameplay event, except casualties, whose action and
   * consequence are two independent events — hence the single correlation
   * step (see `tp-match-events-correlation.service.ts`). Administrative
   * events (weather, inducements, winnings, …) carry only a team scope, never
   * player attribution.
   *
   * A roster id that resolves to no team era, or a `lineUpId` with no imported
   * player, is a non-fatal error: the field is omitted and the event still
   * upserts.
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
      { name: tpSystemName, category: 'imported_data_source' },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported, errors }) };
    }
    const [tpSystemId] = bootstrap.ids;

    const batch = this.matchEventsImport.createBatch(errors);

    try {
      for (const [competitionId, matches] of matchesByCompetitionId) {
        const eraId = eraIdByCompetitionId.get(competitionId);
        if (eraId === undefined) {
          errors.push(
            this.importResults.error({
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
              this.importResults.error({
                item: { match: match.id },
                message: `Skipping match events for match "${match.id}": it has no imported match id.`,
              }),
            );
            continue;
          }

          const homeTeamEraId = this.eventsBuilder.resolveTeamEraId({
            teamErasByRosterId,
            rosterId: match.homeTeamTpId,
            eraId,
          });
          const awayTeamEraId = this.eventsBuilder.resolveTeamEraId({
            teamErasByRosterId,
            rosterId: match.awayTeamTpId,
            eraId,
          });
          const casualtyPairing = this.eventsCorrelation.correlateCasualties(
            match.matchEvents,
          );
          const foulPairing = this.eventsCorrelation.correlateFouls(
            match.matchEvents,
            casualtyPairing,
          );

          for (const event of match.matchEvents) {
            const dataList = this.eventsBuilder.buildEventData({
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
              foulPairing,
            });
            for (const data of dataList) {
              imported += await this.matchEventsImport.addToBatch(batch, data);
            }
          }
        }
      }
    } finally {
      imported += await this.matchEventsImport.flushBatch(batch);
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
