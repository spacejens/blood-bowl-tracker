import type { ImportError } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { BblMatchEvents } from '../matches/match-events-page-parser';
import { MatchEventsPageParser } from '../matches/match-events-page-parser';
import { BblSourceReader } from '../source/bbl-source-reader';
import { PageParseErrorService } from '../source/page-parse-error.service';

const MATCH_DETAIL_PAGE_TYPE = 'm';

@Injectable()
export class BblMatchEventsReaderService {
  private cache: Map<string, BblMatchEvents> | undefined;

  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly matchEventsPageParser: MatchEventsPageParser,
    private readonly pageParseError: PageParseErrorService,
  ) {}

  /**
   * Read every match's raw event occurrences in a single pass over the `m`
   * pages, keyed by the match's numeric BBL id. All pages are local file reads
   * (no network cost). Pages the parser cannot turn into events (returning
   * null) are skipped; a page that throws is recorded as an import error and
   * skipped. The result is memoized on the instance so repeated calls within a
   * process reuse the first walk. This is the events counterpart to
   * {@link BblMatchDetailReaderService}, kept separate so each reader owns a
   * single memoized page walk.
   */
  async getMatchEventsByBblId(
    errors: ImportError[],
  ): Promise<Map<string, BblMatchEvents>> {
    if (this.cache) {
      return this.cache;
    }
    const matchEventsByBblId = new Map<string, BblMatchEvents>();
    for await (const page of this.sourceReader.pages(MATCH_DETAIL_PAGE_TYPE)) {
      try {
        const events = this.matchEventsPageParser.extractMatchEvents(page);
        if (!events) {
          continue;
        }
        matchEventsByBblId.set(events.bblId, events);
      } catch (error) {
        errors.push(
          this.pageParseError.build(page.params, 'match events', error),
        );
      }
    }
    this.cache = matchEventsByBblId;
    return matchEventsByBblId;
  }
}
