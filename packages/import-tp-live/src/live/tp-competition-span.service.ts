import type { CompetitionType } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A match-date span of at most this many days makes a competition a cup,
 * anything longer a season — the same threshold tools/import-tp and
 * tools/import-bbl classify by.
 */
const CUP_MAX_SPAN_DAYS = 3;

/** A competition's type and dates, derived from its matches' dates. */
export interface TpCompetitionSpan {
  type: CompetitionType;
  /** ISO `YYYY-MM-DD` of the earliest match. */
  startDate: string;
  /** ISO `YYYY-MM-DD` of the latest match. */
  endDate: string;
}

/**
 * Derives a TP competition's type and start/end dates from its match dates,
 * the way the bulk importer does. A separate copy of packages/import's
 * MatchDateRangeService arithmetic, because this package runs server-side
 * and cannot depend on packages/import. Pure and dependency-free.
 */
@Injectable()
export class TpCompetitionSpanService {
  /** Undefined when there is no date to derive from. */
  derive(dates: Date[]): TpCompetitionSpan | undefined {
    if (dates.length === 0) {
      return undefined;
    }
    const times = dates.map((date) => date.getTime());
    const earliest = Math.min(...times);
    const latest = Math.max(...times);
    return {
      type:
        (latest - earliest) / MS_PER_DAY <= CUP_MAX_SPAN_DAYS
          ? 'cup'
          : 'season',
      startDate: new Date(earliest).toISOString().slice(0, 10),
      endDate: new Date(latest).toISOString().slice(0, 10),
    };
  }
}
