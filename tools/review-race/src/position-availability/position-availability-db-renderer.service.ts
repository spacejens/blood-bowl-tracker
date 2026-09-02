import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';

/**
 * What the importers actually stored for `positions_race_eras`: one row per
 * (era, position) pair this race can field. `positions_race_eras` is keyed per
 * era, not per rules set, so "First era" covers CRP, CRP+ and BB2016 together.
 */
@Injectable()
export class PositionAvailabilityDbRendererService {
  constructor(
    private readonly query: RacePositionsQueryService,
    private readonly html: HtmlService,
  ) {}

  async render(race: SampledRace): Promise<string> {
    const rows = await this.query.positionsFor(race.raceId);
    if (rows.length === 0) {
      return this.html.note(
        `No positions_race_eras rows for race "${race.raceName}".`,
      );
    }
    return this.html.table(
      ['Era', 'Position', 'Position id'],
      rows.map((row) => [
        row.eraName,
        row.positionName,
        String(row.positionId),
      ]),
    );
  }
}
