import { Injectable } from '@nestjs/common';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The earliest/latest match date of a competition and the span between them. */
export interface MatchDateRange {
  earliestDate: Date;
  latestDate: Date;
  /** (latest - earliest) in days; fractional when the times differ. */
  spanDays: number;
}

/**
 * Computes the date range of a competition's matches. Both importers collect
 * every match date before creating a competition — to classify its type by
 * date span, and to populate the competition's startDate/endDate — so the
 * min/max/span arithmetic lives here once instead of being inlined in each
 * importer.
 */
@Injectable()
export class MatchDateRangeService {
  /**
   * Throws on an empty list: a competition with no dated matches is a skip
   * case each importer already detects and reports itself, so there is no
   * meaningful range to return here.
   */
  computeRange(dates: Date[]): MatchDateRange {
    if (dates.length === 0) {
      throw new Error(
        'computeRange requires at least one date; callers must handle a ' +
          'competition with no dated matches before calling.',
      );
    }
    const times = dates.map((date) => date.getTime());
    const earliest = Math.min(...times);
    const latest = Math.max(...times);
    return {
      earliestDate: new Date(earliest),
      latestDate: new Date(latest),
      spanDays: (latest - earliest) / MS_PER_DAY,
    };
  }
}
