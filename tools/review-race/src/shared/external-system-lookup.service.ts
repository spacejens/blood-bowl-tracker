import type { Db } from '@blood-bowl-tracker/db';
import { DB, externalSystems } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import type { ReviewSource } from './review.types';

/**
 * Resolves each source's `external_systems.id` from its configured name, once
 * per process. Only meaningful for `'bbl'` and `'tp'`: the hand-curated
 * `'manual'` data registers into those systems' id spaces (and the
 * bookkeeping "Name" system) rather than one of its own, so nothing calls
 * this with `'manual'`.
 */
@Injectable()
export class ExternalSystemLookupService {
  private readonly cache = new Map<ReviewSource, number>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: RaceReviewConfigService,
  ) {}

  async getSystemId(source: ReviewSource): Promise<number> {
    const cached = this.cache.get(source);
    if (cached !== undefined) {
      return cached;
    }
    const name = this.config.getExternalSystemName(source);
    const rows = await this.db
      .select({ id: externalSystems.id })
      .from(externalSystems)
      .where(eq(externalSystems.name, name));
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error(
        `No external system named "${name}" exists in the database. Check ` +
          `${source}.externalSystemName in review-race-config.json5 and that ` +
          'the import has run against this database.',
      );
    }
    this.cache.set(source, id);
    return id;
  }
}
