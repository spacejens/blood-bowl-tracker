import type { ImportError } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import type { CompetitionTrophyPlacements } from './competition-trophy-page-parser';
import { CompetitionTrophyPageParser } from './competition-trophy-page-parser';

const RESULTS_PAGE_TYPE = 'sr';

/**
 * Reads every competition's trophy placements in a single pass over the sr
 * results pages, keyed by competition BBL id (the `s` param). This is a
 * per-competition placement summary, not a per-match artifact, so it is read
 * once per run and shared. The first page seen per `s` wins if the mirror
 * holds duplicates. Per-page parse failures are recorded and skipped. The
 * result is memoized on the instance, matching
 * BblCompetitionStandingsReaderService.
 */
@Injectable()
export class BblCompetitionTrophyReaderService {
  private cache: Map<string, CompetitionTrophyPlacements> | undefined;

  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly parser: CompetitionTrophyPageParser,
    private readonly pageParseError: PageParseErrorService,
  ) {}

  async getPlacementsByCompetitionId(
    errors: ImportError[],
  ): Promise<Map<string, CompetitionTrophyPlacements>> {
    if (this.cache) {
      return this.cache;
    }
    const placementsByCompetitionId = new Map<
      string,
      CompetitionTrophyPlacements
    >();
    for await (const page of this.sourceReader.pages(RESULTS_PAGE_TYPE)) {
      const competitionId = page.params.s;
      if (
        competitionId === undefined ||
        placementsByCompetitionId.has(competitionId)
      ) {
        continue;
      }
      try {
        placementsByCompetitionId.set(
          competitionId,
          this.parser.extractPlacements(page),
        );
      } catch (error) {
        errors.push(
          this.pageParseError.build(page.params, 'competition trophy', error),
        );
      }
    }
    this.cache = placementsByCompetitionId;
    return placementsByCompetitionId;
  }
}
