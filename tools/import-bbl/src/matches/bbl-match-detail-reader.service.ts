import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';
import type { BblMatchDetails } from './match-teams-page-parser';
import { MatchTeamsPageParser } from './match-teams-page-parser';

const MATCH_DETAIL_PAGE_TYPE = 'm';

@Injectable()
export class BblMatchDetailReaderService {
  private cache: Map<string, BblMatchDetails> | undefined;

  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly matchTeamsPageParser: MatchTeamsPageParser,
    private readonly importResults: ImportResultService,
    private readonly pageParseError: PageParseErrorService,
  ) {}

  /**
   * Read every match's two team ids and display name in a single pass over the
   * `m` pages, keyed by the match's numeric BBL id. All pages are local file
   * reads (no network cost). Per-page parse failures — the parser returning
   * null or throwing — are recorded as import errors and skipped. The result
   * is memoized on the instance so repeated calls within a process reuse the
   * first walk.
   */
  async getMatchTeamsByBblId(
    errors: ImportError[],
  ): Promise<Map<string, BblMatchDetails>> {
    if (this.cache) {
      return this.cache;
    }
    const matchTeamsByBblId = new Map<string, BblMatchDetails>();
    for await (const page of this.sourceReader.pages(MATCH_DETAIL_PAGE_TYPE)) {
      try {
        const teams = this.matchTeamsPageParser.extractMatchTeams(page);
        if (!teams) {
          errors.push(
            this.importResults.error({
              item: { page: page.params },
              message: `Failed to parse match detail page ${JSON.stringify(page.params)}: could not extract team ids or name.`,
            }),
          );
          continue;
        }
        matchTeamsByBblId.set(teams.bblId, teams);
      } catch (error) {
        errors.push(
          this.pageParseError.build(page.params, 'match detail', error),
        );
      }
    }
    this.cache = matchTeamsByBblId;
    return matchTeamsByBblId;
  }
}
