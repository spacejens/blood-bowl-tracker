import type { ExternalRef } from '../data-file/manual-data-file.schema';

/**
 * In-memory map from an external-id pair to the database id of the entity that
 * declared it. Keyed by `${system}|${id}` so any pair an entity listed resolves
 * to the same id — later entities can reference a target by whichever pair they
 * know it by.
 */
export class ExternalIdMap {
  private readonly map = new Map<string, number>();

  private static keyOf(ref: ExternalRef): string {
    return `${ref.system}|${ref.id}`;
  }

  add(refs: readonly ExternalRef[], entityId: number): void {
    for (const ref of refs) {
      this.map.set(ExternalIdMap.keyOf(ref), entityId);
    }
  }

  resolve(ref: ExternalRef): number | undefined {
    return this.map.get(ExternalIdMap.keyOf(ref));
  }
}
