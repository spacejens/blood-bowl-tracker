import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, externalSystems } from '@blood-bowl-tracker/db';
import type { Type } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';

import type { ReviewSource } from './review.types';
import type { ReviewConfigService } from './review-config-base.service';

/** What every generated external-system lookup base class offers. */
export interface ExternalSystemLookupServiceBase {
  getSystemId(source: ReviewSource): Promise<number>;
}

/**
 * Named so `tsc --declaration` can emit `declare const X_base: ...` for every
 * subclass; an anonymous class expression here would fail declaration emit.
 */
export type ExternalSystemLookupServiceConstructor = new (
  db: Db,
  config: ReviewConfigService,
) => ExternalSystemLookupServiceBase;

/**
 * Builds the shared body of a review tool's external-system lookup: resolving
 * each source's `external_systems.id` from its configured name, once per
 * process. Every query that joins a source's external ids needs this id, so
 * it is memoized here rather than re-queried per stratum.
 *
 * A class-factory rather than a service, for the same reason as
 * `createReviewConfigServiceBase`: what it returns is the `@Injectable()`
 * class each review tool's lookup service extends, so NestJS DI manages the
 * result directly. The tool's own config service class is passed in because
 * it is the DI token the base injects through; `fileName` is the tool's
 * config file name, named in the not-found error so a developer is pointed at
 * the file they actually have to edit.
 */
export function createExternalSystemLookupServiceBase(
  configServiceClass: Type<ReviewConfigService>,
  fileName: string,
): ExternalSystemLookupServiceConstructor {
  @Injectable()
  class ExternalSystemLookupBase implements ExternalSystemLookupServiceBase {
    private readonly cache = new Map<ReviewSource, number>();

    constructor(
      @Inject(DB) private readonly db: Db,
      @Inject(configServiceClass)
      private readonly config: ReviewConfigService,
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
            `${source}.externalSystemName in ${fileName} and that ` +
            'the import has run against this database.',
        );
      }
      this.cache.set(source, id);
      return id;
    }
  }

  return ExternalSystemLookupBase;
}
