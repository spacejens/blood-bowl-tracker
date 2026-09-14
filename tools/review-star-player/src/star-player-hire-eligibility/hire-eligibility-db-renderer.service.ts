import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';

/**
 * What the importers actually stored for this star's hire eligibility: one
 * `positions_race_eras` row per (race, era) pair it is claimed hireable in.
 *
 * The distinct-race count is stated up front because it is the number a
 * reviewer checks first: `tools/import-bbl`'s star-player exception links a
 * star as available in every era its races span, so an implausibly wide
 * count is the symptom that rule produces.
 */
@Injectable()
export class HireEligibilityDbRendererService {
  constructor(
    private readonly query: StarPlayerPositionsQueryService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const rows = await this.query.hireEligibilityFor(star.positionId);
    if (rows.length === 0) {
      return this.html.note(
        `No positions_race_eras rows for star player "${star.positionName}".`,
      );
    }
    const races = new Set(rows.map((row) => row.raceId));
    return (
      this.html.subheading(
        `Hireable by ${races.size} race(s) across ${rows.length} (race, era) row(s)`,
      ) +
      this.html.table(
        ['Race', 'Era', 'Era dates'],
        rows.map((row) => [
          row.raceName,
          row.eraName,
          `${row.startDate} – ${row.endDate ?? 'ongoing'}`,
        ]),
      )
    );
  }
}
