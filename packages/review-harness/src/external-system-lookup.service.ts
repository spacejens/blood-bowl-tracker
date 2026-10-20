import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, externalSystems } from '@blood-bowl-tracker/db';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import type { ReviewSource } from './review.types';

/**
 * The external system each source's records are registered under. The
 * hand-curated `manual` data registers into the BBL, TP and Name id spaces
 * rather than one of its own, so it has no entry.
 */
const SOURCE_EXTERNAL_SYSTEM_NAMES: Partial<Record<ReviewSource, string>> = {
  bbl: BBL_EXTERNAL_SYSTEM_NAME,
  tp: TP_EXTERNAL_SYSTEM_NAME,
};

/**
 * Resolves each source's `external_systems.id` from its shared external-system
 * name, once per process. Every query that joins a source's external ids
 * needs this id, so it is memoized rather than re-queried per stratum.
 */
@Injectable()
export class ExternalSystemLookupService {
  private readonly cache = new Map<ReviewSource, number>();

  constructor(@Inject(DB) private readonly db: Db) {}

  async getSystemId(source: ReviewSource): Promise<number> {
    const cached = this.cache.get(source);
    if (cached !== undefined) {
      return cached;
    }
    const name = SOURCE_EXTERNAL_SYSTEM_NAMES[source];
    if (name === undefined) {
      throw new Error(
        `The ${source} source has no external system of its own.`,
      );
    }
    const rows = await this.db
      .select({ id: externalSystems.id })
      .from(externalSystems)
      .where(eq(externalSystems.name, name));
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error(
        `No external system named "${name}" exists in the database. ` +
          `Check that the ${source} import has run against this database.`,
      );
    }
    this.cache.set(source, id);
    return id;
  }
}
