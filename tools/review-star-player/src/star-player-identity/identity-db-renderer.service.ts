import type { TableCell } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';

/**
 * What the importers actually stored about a star's identity: its `positions`
 * row and every external id it carries.
 *
 * Cost is rendered as an explicit "not stored" row rather than omitted: the
 * `positions` table has no cost column at all, so a reviewer comparing BBL's
 * inducement price and TP's `cost` against the database must be told that the
 * database has nothing to compare, not left to wonder whether the panel just
 * forgot it.
 */
@Injectable()
export class StarPlayerIdentityDbRendererService {
  constructor(
    private readonly externalIds: StarPlayerExternalIdsService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const ids = await this.externalIds.allForPosition(star.positionId);
    const idRows: TableCell[][] =
      ids.length === 0
        ? [['External id', 'none']]
        : ids.map((id) => [`External id (${id.systemName})`, id.externalId]);
    return this.html.table(
      ['Field', 'Value'],
      [
        ['Database id (positions.id)', String(star.positionId)],
        ['Name', star.positionName],
        ['is_star_player', 'true'],
        ['Cost', 'not stored — positions carries no cost column'],
        ...idRows,
      ],
    );
  }
}
