import { playerExternalIds } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type { ReviewPlayer, ReviewSource } from '../shared/review.types';

/**
 * Resolves a source's own player ids (BBL's `pid`, TP's line-up `id`) to the
 * database players the report covers. Used for the config's pinned overrides;
 * strata do their own, wider queries.
 */
@Injectable()
export class PlayerLookupService {
  constructor(
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly query: PlayerProjectionQueryService,
  ) {}

  async findByExternalIds(
    source: ReviewSource,
    externalIds: string[],
  ): Promise<ReviewPlayer[]> {
    if (externalIds.length === 0) {
      return [];
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .where(inArray(playerExternalIds.externalId, externalIds));
    return rows.map((row) => ({ source, ...row }));
  }
}
