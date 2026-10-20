import type { CompetitionType } from '@blood-bowl-tracker/api-contract';
import { CompetitionTypeService } from '@blood-bowl-tracker/import-shared';
import { Injectable } from '@nestjs/common';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A competition's type and dates, derived from its matches' dates. */
export interface TpCompetitionSpan {
  type: CompetitionType;
  /** ISO `YYYY-MM-DD` of the earliest match. */
  startDate: string;
  /** ISO `YYYY-MM-DD` of the latest match. */
  endDate: string;
}

/**
 * Derives a TP competition's type and start/end dates from its match dates.
 * The cup/season threshold is packages/import-shared's CompetitionTypeService,
 * the rule tools/import-bbl classifies by too. The date arithmetic is a
 * separate copy of packages/import's MatchDateRangeService, because this
 * package runs server-side and cannot depend on packages/import.
 */
@Injectable()
export class TpCompetitionSpanService {
  constructor(private readonly competitionType: CompetitionTypeService) {}

  /** Undefined when there is no date to derive from. */
  derive(dates: Date[]): TpCompetitionSpan | undefined {
    if (dates.length === 0) {
      return undefined;
    }
    const times = dates.map((date) => date.getTime());
    const earliest = Math.min(...times);
    const latest = Math.max(...times);
    return {
      type: this.competitionType.fromSpanDays((latest - earliest) / MS_PER_DAY),
      startDate: new Date(earliest).toISOString().slice(0, 10),
      endDate: new Date(latest).toISOString().slice(0, 10),
    };
  }
}
