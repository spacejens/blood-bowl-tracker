import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  inArray,
  positionExternalIds,
  positions,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { ReviewSource, ReviewStarPlayer } from '../shared/review.types';

/**
 * Resolves the config's pinned overrides to database star players.
 *
 * A BBL override is the page's numeric typID, not the stored external id:
 * `tools/import-bbl` writes one `"<typId>-<raceBblId>"` id per race the page
 * listed, so a developer copying an id out of a BBL URL would otherwise have
 * to guess which race half to append. The match is therefore on the part
 * before the first `-`.
 *
 * A TP override is TP's own spelling (its `tourplay.net` external id),
 * matched exactly. A manual override is the star's stored name, because the
 * hand-curated data registers into the BBL/TP/Name id spaces rather than one
 * of its own.
 *
 * Strata do their own, wider queries.
 */
@Injectable()
export class StarPlayerLookupService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
  ) {}

  async findByExternalIds(
    source: ReviewSource,
    externalIds: string[],
  ): Promise<ReviewStarPlayer[]> {
    if (externalIds.length === 0) {
      return [];
    }
    if (source === 'manual') {
      return await this.findByNames(externalIds);
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const idColumn =
      source === 'bbl'
        ? sql`split_part(${positionExternalIds.externalId}, '-', 1)`
        : sql`${positionExternalIds.externalId}`;
    return await this.db
      .selectDistinct({
        positionId: positions.id,
        positionName: positions.name,
      })
      .from(positions)
      .innerJoin(
        positionExternalIds,
        and(
          eq(positionExternalIds.positionId, positions.id),
          eq(positionExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .where(
        and(eq(positions.isStarPlayer, true), inArray(idColumn, externalIds)),
      );
  }

  private async findByNames(names: string[]): Promise<ReviewStarPlayer[]> {
    return await this.db
      .select({ positionId: positions.id, positionName: positions.name })
      .from(positions)
      .where(
        and(
          eq(positions.isStarPlayer, true),
          inArray(
            sql`lower(${positions.name})`,
            names.map((name) => name.toLowerCase()),
          ),
        ),
      );
  }
}
