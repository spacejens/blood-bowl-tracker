import type { ImportError } from '@blood-bowl-tracker/import';
import type { ResolvableEntityKind } from '@blood-bowl-tracker/import';
import {
  ExternalIdResolverService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM_NAME,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ExternalRef } from '../data-file/manual-data-file.schema';

export interface ResolveRefOptions {
  ref: ExternalRef;
  systemIds: ReadonlyMap<string, number>;
  errors: ImportError[];
  item: unknown;
  label: string;
  /** The kind of the entity being *referenced*, not the referring one. */
  kind: ResolvableEntityKind;
}

export interface ResolveRefsOptions {
  refs: readonly ExternalRef[];
  systemIds: ReadonlyMap<string, number>;
  errors: ImportError[];
  item: unknown;
  label: string;
  /** The kind of the entities being *referenced*, not the referring one. */
  kind: ResolvableEntityKind;
}

export interface ResolveOptionalRefOptions {
  ref: ExternalRef | undefined;
  systemIds: ReadonlyMap<string, number>;
  errors: ImportError[];
  item: unknown;
  label: string;
  /** The kind of the entity being *referenced*, not the referring one. */
  kind: ResolvableEntityKind;
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
  constructor(
    private readonly resolver: ExternalIdResolverService,
    private readonly importResults: ImportResultService,
    private readonly nameExternalId: NameExternalIdService,
  ) {}

  /**
   * The external-id pair a curated competition group registers its own
   * identity under: its `name` turned into the synthetic "Name"-system ref,
   * the same way `BblLeaguesImportService` derives a league's. Used only by
   * `CompetitionGroupsProcessor` for a group's own upsert -- a trophy or
   * competition entry *referencing* a group instead writes that same pair out
   * explicitly (`competitionGroup: { system: 'Name', id: 'Major Season' }`)
   * and resolves it via `resolveOptionalRef` like any other cross-reference.
   */
  competitionGroupRef(name: string): ExternalRef {
    return {
      system: NAME_EXTERNAL_SYSTEM_NAME,
      id: this.nameExternalId.forCompetitionGroup(name),
    };
  }

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
   * The single-ref counterpart of {@link toExternalIds}, with the same
   * throw-on-unknown-system contract.
   */
  toExternalId(
    ref: ExternalRef,
    systemIds: ReadonlyMap<string, number>,
  ): { externalSystemId: number; externalId: string } {
    return this.toExternalIds([ref], systemIds)[0];
  }

  /**
   * Resolve a single cross-reference against the database, through the API's
   * `resolve` procedure. Records one ImportError (prefixed with `label`) and
   * returns undefined when unresolved.
   *
   * The error message quotes the external system by the *name* the data file
   * spells it with, not the numeric id the API works in — which is why this
   * calls ExternalIdResolverService directly rather than going through
   * packages/import's ReferenceLookupService.
   */
  async resolveRef(options: ResolveRefOptions): Promise<number | undefined> {
    const id = await this.resolver.resolve(
      options.kind,
      this.toExternalId(options.ref, options.systemIds),
    );
    if (id === undefined) {
      options.errors.push(this.unresolvedError(options.ref, options));
    }
    return id;
  }

  /**
   * Resolve a list of cross-references in one round trip. Records one
   * ImportError per unresolved ref and returns undefined if any failed, so
   * the caller can skip the entry; returns the resolved ids in order when
   * all succeed.
   */
  async resolveRefs(
    options: ResolveRefsOptions,
  ): Promise<number[] | undefined> {
    if (options.refs.length === 0) {
      return [];
    }
    const resolved = await this.resolver.resolveBatch(
      options.kind,
      this.toExternalIds(options.refs, options.systemIds),
    );
    const ids: number[] = [];
    let ok = true;
    resolved.forEach((id, index) => {
      if (id === undefined) {
        ok = false;
        options.errors.push(this.unresolvedError(options.refs[index], options));
      } else {
        ids.push(id);
      }
    });
    return ok ? ids : undefined;
  }

  /**
   * Resolve a cross-reference the entry may legitimately have omitted.
   * Omitted refs resolve to `{ ok: true, id: undefined }` with no error — the
   * upsert simply leaves that field alone. A ref that is present but
   * unresolvable records one ImportError and reports `{ ok: false }`, so
   * the caller skips the entry exactly as before.
   */
  async resolveOptionalRef(
    options: ResolveOptionalRefOptions,
  ): Promise<OptionalRefResult> {
    if (options.ref === undefined) {
      return { ok: true, id: undefined };
    }
    const id = await this.resolveRef({ ...options, ref: options.ref });
    return id === undefined ? { ok: false } : { ok: true, id };
  }

  private unresolvedError(
    ref: ExternalRef,
    options: { item: unknown; label: string },
  ): ImportError {
    return this.importResults.error({
      item: options.item,
      message: `${options.label}: could not resolve reference ${ref.system}|${ref.id}.`,
    });
  }
}
