import type { SppAwardValueEntry as ApiSppAwardValueEntry } from '@blood-bowl-tracker/api-contract';
import { SppAwardValuesImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Turns the data file's `sppAwardValues` entries into one sync call. Unlike
 * the entity processors, every entry is resolved first and then sent
 * together: the API upserts the whole table by natural key in one round trip,
 * and an entry whose references do not resolve is dropped (with an error
 * recorded) rather than aborting the others — the same
 * one-bad-entry-does-not-stop-the-rest policy every other processor follows.
 *
 * Must run after the rulesSets and races processors, since it references
 * rows they create.
 */
@Injectable()
export class SppAwardValuesProcessor {
  constructor(
    private readonly sppAwardValuesImport: SppAwardValuesImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    const values: ApiSppAwardValueEntry[] = [];

    for (const entry of ctx.data.sppAwardValues) {
      const label = `Cannot import SPP award value for "${entry.actionType}"`;
      const rulesSetId = this.refResolver.resolveRef({
        ref: entry.rulesSet,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'rulesSet',
      });
      if (rulesSetId === undefined) {
        continue;
      }
      const race = this.refResolver.resolveOptionalRef({
        ref: entry.race,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'race',
      });
      if (!race.ok) {
        continue;
      }
      values.push({
        rulesSetId,
        // An omitted race means the rules set's baseline, which the API and
        // the database both spell as an explicit null raceId.
        raceId: race.id ?? null,
        actionType: entry.actionType,
        sppValue: entry.sppValue,
      });
    }

    if (values.length === 0) {
      return 0;
    }

    const result = await this.sppAwardValuesImport.syncSppAwardValues(
      { values },
      ctx.errors,
    );
    return result === undefined ? 0 : values.length;
  }
}
