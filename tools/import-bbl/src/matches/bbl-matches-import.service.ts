import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  makeImportError,
  makeImportResult,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblMatchDetailReaderService } from './bbl-match-detail-reader.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { MatchMergeService } from './match-merge.service';

@Injectable()
export class BblMatchesImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly matchesImport: MatchesImportService,
    private readonly matchMerge: MatchMergeService,
    private readonly matchDetailReader: BblMatchDetailReaderService,
  ) {}

  /**
   * Import every completed match from the ma match-list rows. Each match is
   * keyed by its numeric BBL id (m=<id>) under the same BBL external system the
   * competition is keyed under; its competitionId is the competition's DB id
   * (resolved via competitionIdsByBblId). A competition whose matches exist but
   * which is absent from the id map (its import failed) has all its matches
   * skipped with one recorded error.
   *
   * A configured merge pair (see MatchMergeService) is imported as a single
   * match: the primary member is upserted once with BOTH members' external ids
   * and the pair's canonical playedAt, which links both source matches to the
   * same DB row via MatchesService.upsert's any-external-id matching; the
   * secondary member is skipped, and both bblIds are mapped to that one DB id.
   * Idempotent.
   */
  async importMatches(
    competitionsByBblId: Map<string, UpsertCompetition>,
    competitionIdsByBblId: Map<string, number>,
  ): Promise<{ result: ImportResult; matchIdsByBblId: Map<string, number> }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const matchIdsByBblId = new Map<string, number>();

    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);
    const merges = await this.matchMerge.resolve(errors);
    const detailsByBblId =
      await this.matchDetailReader.getMatchTeamsByBblId(errors);

    for (const [competitionBblId, matches] of matchesByCompetitionId) {
      const competition = competitionsByBblId.get(competitionBblId);
      const competitionId = competitionIdsByBblId.get(competitionBblId);
      if (competition === undefined || competitionId === undefined) {
        errors.push(
          makeImportError({
            item: { competition: competitionBblId },
            message: `Skipping matches for competition id ${competitionBblId}: it was not imported.`,
          }),
        );
        continue;
      }

      const externalSystemId = competition.externalIds[0].externalSystemId;

      for (const match of matches) {
        // A secondary pair member is folded into its primary's upsert below,
        // so skip it here (its matchIdsByBblId entry is set with the primary's).
        if (merges.isSecondary(match.bblId)) {
          continue;
        }

        const details = detailsByBblId.get(match.bblId);
        if (details === undefined) {
          errors.push(
            makeImportError({
              item: { match: match.bblId },
              message: `Skipping match ${match.bblId}: its detail page was missing or failed to parse.`,
            }),
          );
          continue;
        }

        const externalIds = [{ externalSystemId, externalId: match.bblId }];
        const partnerBblId = merges.partnerBblId(match.bblId);
        if (partnerBblId !== undefined) {
          externalIds.push({ externalSystemId, externalId: partnerBblId });
        }

        const upserted = await this.matchesImport.upsertMatchResult(
          {
            competitionId,
            playedAt: merges.effectivePlayedAt(match.bblId, match.date),
            name: details.name,
            externalIds,
            teamEraIds: [],
          },
          errors,
        );
        if (upserted) {
          imported += 1;
          matchIdsByBblId.set(match.bblId, upserted.id);
          if (partnerBblId !== undefined) {
            matchIdsByBblId.set(partnerBblId, upserted.id);
          }
        }
      }
    }

    return { result: makeImportResult({ imported, errors }), matchIdsByBblId };
  }
}
