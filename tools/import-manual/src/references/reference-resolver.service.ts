import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ExternalRef } from '../data-file/manual-data-file.schema';
import type { ExternalIdMap } from './external-id-map';

export interface ResolveRefOptions {
  ref: ExternalRef;
  idMap: ExternalIdMap;
  errors: ImportError[];
  item: unknown;
  label: string;
}

export interface ResolveRefsOptions {
  refs: readonly ExternalRef[];
  idMap: ExternalIdMap;
  errors: ImportError[];
  item: unknown;
  label: string;
}

export interface ResolveOptionalRefOptions {
  ref: ExternalRef | undefined;
  idMap: ExternalIdMap;
  errors: ImportError[];
  item: unknown;
  label: string;
}

/**
 * Three outcomes, because "the entry said nothing about this reference" and
 * "the entry named a reference that does not exist" must be handled
 * differently: the first passes `undefined` through so the upsert leaves the
 * stored value alone, the second is an authoring error that skips the entry.
 */
export type OptionalRefResult =
  { ok: true; id: number | undefined } | { ok: false };

@Injectable()
export class ReferenceResolverService {
  constructor(private readonly importResults: ImportResultService) {}

  /**
   * Map an entry's declared external-id pairs to the API's
   * { externalSystemId, externalId } shape. Throws on an unknown system name —
   * the external-system bootstrap registers every referenced name up front, so
   * an unknown name here means a bug in that bootstrap, not authored data.
   */
  toExternalIds(
    refs: readonly ExternalRef[],
    systemIds: ReadonlyMap<string, number>,
  ): { externalSystemId: number; externalId: string }[] {
    return refs.map((ref) => {
      const externalSystemId = systemIds.get(ref.system);
      if (externalSystemId === undefined) {
        throw new Error(`Unknown external system "${ref.system}".`);
      }
      return { externalSystemId, externalId: ref.id };
    });
  }

  /**
   * Resolve a single cross-reference against the run's ExternalIdMap. Records
   * one ImportError (prefixed with `label`) and returns undefined when
   * unresolved.
   */
  resolveRef(options: ResolveRefOptions): number | undefined {
    const id = options.idMap.resolve(options.ref);
    if (id === undefined) {
      options.errors.push(
        this.importResults.error({
          item: options.item,
          message: `${options.label}: could not resolve reference ${options.ref.system}|${options.ref.id}.`,
        }),
      );
    }
    return id;
  }

  /**
   * Resolve a list of cross-references. Records one ImportError per
   * unresolved ref and returns undefined if any failed, so the caller can
   * skip the entry; returns the resolved ids in order when all succeed.
   */
  resolveRefs(options: ResolveRefsOptions): number[] | undefined {
    const ids: number[] = [];
    let ok = true;
    for (const ref of options.refs) {
      const id = this.resolveRef({
        ref,
        idMap: options.idMap,
        errors: options.errors,
        item: options.item,
        label: options.label,
      });
      if (id === undefined) {
        ok = false;
      } else {
        ids.push(id);
      }
    }
    return ok ? ids : undefined;
  }

  /**
   * Resolve a cross-reference the entry may legitimately have omitted.
   * Omitted refs resolve to `{ ok: true, id: undefined }` with no error — the
   * upsert simply leaves that field alone. A ref that is present but
   * unresolvable records one ImportError and reports `{ ok: false }`, so
   * the caller skips the entry exactly as before.
   */
  resolveOptionalRef(options: ResolveOptionalRefOptions): OptionalRefResult {
    if (options.ref === undefined) {
      return { ok: true, id: undefined };
    }
    const id = this.resolveRef({
      ref: options.ref,
      idMap: options.idMap,
      errors: options.errors,
      item: options.item,
      label: options.label,
    });
    return id === undefined ? { ok: false } : { ok: true, id };
  }
}
