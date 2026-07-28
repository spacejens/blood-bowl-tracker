import type {
  MatchCategory,
  UpsertMatch,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpMatchCategoryService } from './tp-match-category.service';

export interface ImportTpMatchesOptions {
  matchesByCompetitionId: Map<number, TpMatch[]>;
  /** Each imported competition's DB id to its type, for category classification. */
  competitionTypesByCompetitionId: Map<number, 'season' | 'cup'>;
}

@Injectable()
export class TpMatchesImportService {
  constructor(
    private readonly matchesImport: MatchesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
    private readonly categoryClassifier: TpMatchCategoryService,
  ) {}

  /**
   * Import every match parsed during competitions import. The input map (from
   * TpCompetitionsImportService.importCompetitions) is keyed by DB competition
   * id — the only association between a match and its competition, since match
   * files carry no tournament id — and each match is upserted under the TP
   * external system keyed by its stringified match id. Matches carry NO Name
   * external id: their names are not unique, so (per
   * docs/game-concepts/matches/index.md) a name must never be an external id.
   * Team-era linkage and match events are out of scope (teamEraIds: []).
   *
   * Every upsert also carries an explicit category, resolved by
   * `TpMatchCategoryService` from the match's TP phase tuple and the rest of
   * its competition's matches (needed to trace a season's playoff bracket —
   * see that service's doc comment). A competition absent from
   * `competitionTypesByCompetitionId` (its type is unknown) has ALL its
   * matches skipped with one recorded error, mirroring how BBL skips a
   * competition that failed to import. A single match whose category cannot
   * be classified (the classifier throws) records a per-match error and is
   * skipped, without aborting the rest of the run — the same loud-failure,
   * per-match-skip rule as BBL's classifier.
   * Idempotent.
   */
  async importMatches(
    options: ImportTpMatchesOptions,
  ): Promise<{ result: ImportResult; matchIdsByTpId: Map<number, number> }> {
    const { matchesByCompetitionId, competitionTypesByCompetitionId } = options;
    let imported = 0;
    const errors: ImportError[] = [];
    const matchIdsByTpId = new Map<number, number>();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        matchIdsByTpId,
      };
    }
    const [tpSystemId] = bootstrap.ids;

    for (const [competitionId, matches] of matchesByCompetitionId) {
      const competitionType =
        competitionTypesByCompetitionId.get(competitionId);
      if (competitionType === undefined) {
        errors.push(
          this.importResults.error({
            item: { competitionId },
            message: `Skipping matches for competition id ${competitionId}: its type is unknown, so match categories cannot be classified.`,
          }),
        );
        continue;
      }

      for (const match of matches) {
        let category: MatchCategory;
        try {
          category = this.categoryClassifier.classify({
            match,
            competitionType,
            competitionMatches: matches,
          });
        } catch (error) {
          errors.push(
            this.importResults.error({
              item: { match: match.id },
              message: `Skipping match ${match.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          );
          continue;
        }

        const data: UpsertMatch = {
          competitionId,
          playedAt: match.playedDate,
          name: match.name,
          category,
          externalIds: [
            { externalSystemId: tpSystemId, externalId: String(match.id) },
          ],
          teamEraIds: [],
        };
        const upserted = await this.matchesImport.upsertMatchResult(
          data,
          errors,
        );
        if (upserted) {
          imported += 1;
          matchIdsByTpId.set(match.id, upserted.id);
        }
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      matchIdsByTpId,
    };
  }
}
