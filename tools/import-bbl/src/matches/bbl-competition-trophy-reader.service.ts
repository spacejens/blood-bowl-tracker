import type { ImportError } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import type {
  CompetitionTrophyPlacements,
  CompetitionTrophyRows,
} from './competition-trophy-page-parser';
import { CompetitionTrophyPageParser } from './competition-trophy-page-parser';

const RESULTS_PAGE_TYPE = 'sr';

/**
 * Reads every competition's award rows in a single pass over the sr results
 * pages, keyed by competition BBL id (the `s` param). This is a
 * per-competition summary, not a per-match artifact, so it is read once per
 * run and shared by both consumers: the trophy-award importer (which wants
 * every row) and the match-outcome importer (which wants only the placement
 * view derived from them). The first page seen per `s` wins if the mirror
 * holds duplicates. Per-page parse failures are recorded and skipped. The
 * result is memoized on the instance, matching
 * BblCompetitionStandingsReaderService.
 */
@Injectable()
export class BblCompetitionTrophyReaderService {
  private cache: Map<string, CompetitionTrophyRows> | undefined;

  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly parser: CompetitionTrophyPageParser,
    private readonly pageParseError: PageParseErrorService,
  ) {}

  async getRowsByCompetitionId(
    errors: ImportError[],
  ): Promise<Map<string, CompetitionTrophyRows>> {
    if (this.cache) {
      return this.cache;
    }
    const rowsByCompetitionId = new Map<string, CompetitionTrophyRows>();
    for await (const page of this.sourceReader.pages(RESULTS_PAGE_TYPE)) {
      const competitionId = page.params.s;
      if (
        competitionId === undefined ||
        rowsByCompetitionId.has(competitionId)
      ) {
        continue;
      }
      try {
        rowsByCompetitionId.set(competitionId, this.parser.extractRows(page));
      } catch (error) {
        errors.push(
          this.pageParseError.build(page.params, 'competition trophy', error),
        );
      }
    }
    this.cache = rowsByCompetitionId;
    return rowsByCompetitionId;
  }

  /**
   * The 1st/2nd/3rd view of the same rows, used only as a tie-break signal by
   * BblMatchOutcomesImportService. Signature and output are unchanged from
   * the earlier implementation.
   */
  async getPlacementsByCompetitionId(
    errors: ImportError[],
  ): Promise<Map<string, CompetitionTrophyPlacements>> {
    const rowsByCompetitionId = await this.getRowsByCompetitionId(errors);
    const placementsByCompetitionId = new Map<
      string,
      CompetitionTrophyPlacements
    >();
    for (const [competitionId, rows] of rowsByCompetitionId) {
      placementsByCompetitionId.set(
        competitionId,
        this.parser.placementsFrom(rows.teamTrophies),
      );
    }
    return placementsByCompetitionId;
  }
}
