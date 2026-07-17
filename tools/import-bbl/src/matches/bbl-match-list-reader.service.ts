import type { ImportError } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import { pageParseError } from '../source/page-parse-error';
import type { BblMatch } from './match-list-page-parser';
import { MatchListPageParser } from './match-list-page-parser';

const MATCH_LIST_PAGE_TYPE = 'ma';
const MATCH_LIST_SORT_BY_SEASON = 's';

@Injectable()
export class BblMatchListReaderService {
  private cache: Map<string, BblMatch[]> | undefined;

  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly matchListPageParser: MatchListPageParser,
  ) {}

  /**
   * Read every competition's completed-match rows in a single pass over the ma
   * pages, keyed by competition BBL id (the `s` param). Only the season-sorted
   * variant (`so=s`) is keyed by competition id; the `&gr=` group-filter variant
   * is a byte-identical duplicate, so the first page seen per `s` wins. Per-page
   * parse failures are recorded and skipped. The result is memoized on the
   * instance so repeated calls within a process reuse the first walk.
   */
  async getMatchesByCompetitionId(
    errors: ImportError[],
  ): Promise<Map<string, BblMatch[]>> {
    if (this.cache) {
      return this.cache;
    }
    const matchesByCompetitionId = new Map<string, BblMatch[]>();
    for await (const page of this.sourceReader.pages(MATCH_LIST_PAGE_TYPE)) {
      const competitionId = page.params.s;
      if (
        page.params.so !== MATCH_LIST_SORT_BY_SEASON ||
        competitionId === undefined ||
        matchesByCompetitionId.has(competitionId)
      ) {
        continue;
      }
      try {
        matchesByCompetitionId.set(
          competitionId,
          this.matchListPageParser.extractMatches(page),
        );
      } catch (error) {
        errors.push(pageParseError(page.params, 'match list', error));
      }
    }
    this.cache = matchesByCompetitionId;
    return matchesByCompetitionId;
  }
}
