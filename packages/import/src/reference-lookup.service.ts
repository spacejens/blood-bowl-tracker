import type { ExternalId } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { ExternalIdResolverService } from './external-id-resolver.service';
import { ImportResultService } from './import-result.service';
import type { ResolvableEntityKind } from './resolvable-entity-kind';
import type { ImportError } from './types';

export interface LookupOptions {
  /** The kind of the entity being *referenced*, not the referring one. */
  kind: ResolvableEntityKind;
  ref: ExternalId;
  errors: ImportError[];
  item: unknown;
  label: string;
}

export interface LookupManyOptions {
  /** The kind of the entities being *referenced*, not the referring one. */
  kind: ResolvableEntityKind;
  refs: readonly ExternalId[];
  errors: ImportError[];
  item: unknown;
  label: string;
}

/**
 * Resolve cross-references over the API and record one `ImportError` per
 * unresolved reference — the policy `tools/import-bbl` and `tools/import-tp`
 * share, so neither reimplements it.
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

  async lookup(options: LookupOptions): Promise<number | undefined> {
    const id = await this.resolver.resolve(options.kind, options.ref);
    if (id === undefined) {
      options.errors.push(this.missError(options.ref, options));
    }
    return id;
  }

  /**
   * Resolve a list in one round trip. Records one error per unresolved ref
   * and returns undefined if any failed, so the caller can skip the entry;
   * returns the ids in order when all succeed.
   */
  async lookupMany(options: LookupManyOptions): Promise<number[] | undefined> {
    if (options.refs.length === 0) {
      return [];
    }
    const resolved = await this.resolver.resolveBatch(
      options.kind,
      options.refs,
    );
    const ids: number[] = [];
    let ok = true;
    resolved.forEach((id, index) => {
      if (id === undefined) {
        ok = false;
        options.errors.push(this.missError(options.refs[index], options));
      } else {
        ids.push(id);
      }
    });
    return ok ? ids : undefined;
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
    const resolved = await this.resolver.resolveBatch(kind, unique);
    const map = new Map<string, number>();
    resolved.forEach((id, index) => {
      if (id !== undefined) {
        map.set(this.keyOf(unique[index]), id);
      }
    });
    return map;
  }

  private missError(
    ref: ExternalId,
    options: { errors: ImportError[]; item: unknown; label: string },
  ): ImportError {
    return this.importResults.error({
      item: options.item,
      message: `${options.label}: could not resolve reference ${ref.externalSystemId}|${ref.externalId}.`,
    });
  }
}
