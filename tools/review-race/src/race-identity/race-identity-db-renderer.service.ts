import type { TableCell } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';

/**
 * What the importers actually stored about a race's identity: its row, the
 * eras it exists in, and every external id it carries. Position availability
 * and characteristics are deliberately absent — they are the other two data
 * types' panel pairs, shown directly under this one.
 */
@Injectable()
export class RaceIdentityDbRendererService {
  constructor(
    private readonly externalIds: RaceExternalIdsService,
    private readonly query: RacePositionsQueryService,
    private readonly html: HtmlService,
  ) {}

  async render(race: SampledRace): Promise<string> {
    const eras = await this.query.erasFor(race.raceId);
    const ids = await this.externalIds.allForRace(race.raceId);
    const eraRows: TableCell[][] =
      eras.length === 0
        ? [['Era', 'none']]
        : eras.map((era) => [
            'Era',
            `${era.eraName} (${era.startDate} – ${era.endDate ?? 'ongoing'})`,
          ]);
    const idRows: TableCell[][] =
      ids.length === 0
        ? [['External id', 'none']]
        : ids.map((id) => [`External id (${id.systemName})`, id.externalId]);
    return this.html.table(
      ['Field', 'Value'],
      [
        ['Database id', String(race.raceId)],
        ['Name', race.raceName],
        ...eraRows,
        ...idRows,
      ],
    );
  }
}
