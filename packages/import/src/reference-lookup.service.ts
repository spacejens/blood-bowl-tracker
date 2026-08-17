import type { ExternalId } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { ExternalIdResolverService } from './external-id-resolver.service';
import { ImportResultService } from './import-result.service';
import type { ResolvableEntityKind } from './resolvable-entity-kind';

/**
 * Resolve cross-references over the API. `tools/import-bbl` and
 * `tools/import-tp` both use `lookupMap`: collect every reference a step
 * needs, resolve them all in one batched round trip, then look each record's
 * reference up locally. Reporting a miss is the caller's job, because callers
 * phrase that error in their own source-specific terms.
 *
 * `tools/import-manual` uses `ExternalIdResolverService` directly instead,
 * because its curated data files name external systems by *name*, and its
 * long-standing error messages quote that name rather than the numeric id
 * the API works in.
 */
@Injectable()
export class ReferenceLookupService {
  constructor(
    private readonly resolver: ExternalIdResolverService,
    private readonly importResults: ImportResultService,
  ) {}

  /** Stable map key for an external-id pair. See lookupMap. */
  keyOf(ref: ExternalId): string {
    return `${ref.externalSystemId}\t${ref.externalId}`;
  }

  /**
   * Resolve many refs in one round trip and answer a map keyed by `keyOf`,
   * containing only the ones that resolved.
   *
   * This is what the high-volume BBL and TP steps use: they collect every
   * reference a step needs, resolve them all at once, then look each record's
   * reference up locally. That keeps the network cost at one round trip per
   * step — the same as the id-maps this replaces — instead of one per record.
   * Reporting a miss is the caller's job here, because the callers phrase
   * that error in their own source-specific terms.
   *
   * A transient RPC failure never propagates out of here: every caller
   * already has a fully-handled path for "none of this batch's refs
   * resolved" (record an ImportError per unresolved ref, skip the affected
   * records), so a caught failure degrades to an empty map and routes
   * through that existing, tested behavior instead of aborting the whole
   * run.
   */
  async lookupMap(
    kind: ResolvableEntityKind,
    refs: readonly ExternalId[],
  ): Promise<Map<string, number>> {
    const distinct = new Map<string, ExternalId>();
    for (const ref of refs) {
      distinct.set(this.keyOf(ref), ref);
    }
    const unique = [...distinct.values()];
    if (unique.length === 0) {
      return new Map();
    }
    let resolved: (number | undefined)[];
    try {
      resolved = await this.resolver.resolveBatch(kind, unique);
    } catch (error) {
      // This ImportError is a diagnostic of the *batch-level* cause,
      // recorded (not thrown) the same way ImportRunnerService's
      // recordUpsert/recordUpsertResult record a caught upsert failure --
      // it is logged here, since lookupMap has no errors[] of its own to
      // append to, rather than duplicated into each caller's per-ref errors.
      const message = error instanceof Error ? error.message : String(error);
      const importError = this.importResults.error({
        item: { kind, refCount: unique.length },
        message:
          `Reference lookup for "${kind}" failed for a batch of ` +
          `${unique.length} reference(s): ${message}. Every reference in ` +
          'this batch will be reported as unresolved.',
      });
      console.error(importError.message);
      return new Map();
    }
    const map = new Map<string, number>();
    resolved.forEach((id, index) => {
      if (id !== undefined) {
        map.set(this.keyOf(unique[index]), id);
      }
    });
    return map;
  }
}
