import type {
  ImportError,
  ImportResult,
  UpsertCompetitionData,
} from '@blood-bowl-tracker/import';
import {
  makeImportError,
  makeImportResult,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblMatchListReaderService } from './bbl-match-list-reader.service';

@Injectable()
export class BblMatchesImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly matchesImport: MatchesImportService,
  ) {}

  /**
   * Import every completed match from the ma match-list rows. Each match is keyed
   * by its numeric BBL id (m=<id>, from the row's onclick) under the same BBL
   * external system the competition is keyed under; its competitionId is the
   * competition's DB id (resolved via competitionIdsByBblId). A competition whose
   * matches exist but which is absent from the id map (its import failed) has all
   * its matches skipped with one recorded error. Idempotent.
   */
  async importMatches(
    competitionsByBblId: Map<string, UpsertCompetitionData>,
    competitionIdsByBblId: Map<string, number>,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);

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
        const success = await this.matchesImport.upsertMatch(
          {
            competitionId,
            playedAt: match.date,
            externalIds: [{ externalSystemId, externalId: match.bblId }],
          },
          errors,
        );
        if (success) {
          imported += 1;
        }
      }
    }

    return { result: makeImportResult({ imported, errors }) };
  }
}
