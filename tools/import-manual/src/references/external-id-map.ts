import type { ExternalRef } from '../data-file/manual-data-file.schema';
import type { EntityKind } from './entity-kind';

/**
 * In-memory map from an external-id pair to the database id of the entity that
 * declared it. Keyed by `${kind}|${system}|${id}` so any pair an entity listed
 * resolves to the same id — later entities can reference a target by whichever
 * pair they know it by — while two *different* kinds of entity that happen to
 * share an external system and id (BBL numbers races and competitions in
 * separate, overlapping sequences) can never clobber each other.
 *
 * `kind` is temporarily optional while call sites are migrated; it becomes
 * required once every processor passes it.
 */
export class ExternalIdMap {
  private readonly map = new Map<string, number>();

  private static keyOf(ref: ExternalRef, kind: EntityKind | undefined): string {
    return `${kind ?? 'unscoped'}|${ref.system}|${ref.id}`;
  }

  /**
   * Register every pair an entity declared. Re-registering the same pair for
   * the same entity is a no-op (an entity's ids may legitimately be added more
   * than once); registering it for a *different* entity throws, turning any
   * future accidental collision into an immediate, loud import-time failure
   * instead of a silent misresolution.
   */
  add(refs: readonly ExternalRef[], entityId: number, kind?: EntityKind): void {
    for (const ref of refs) {
      const key = ExternalIdMap.keyOf(ref, kind);
      const existing = this.map.get(key);
      if (existing !== undefined && existing !== entityId) {
        throw new Error(
          `Duplicate external id for kind "${kind ?? 'unscoped'}": ${ref.system}|${ref.id} is already registered to entity ${existing}, cannot register it to entity ${entityId}.`,
        );
      }
      this.map.set(key, entityId);
    }
  }

  resolve(ref: ExternalRef, kind?: EntityKind): number | undefined {
    return this.map.get(ExternalIdMap.keyOf(ref, kind));
  }
}
