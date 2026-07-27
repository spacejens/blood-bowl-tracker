import { Injectable } from '@nestjs/common';

/** The two rosters a TP `match_<id>.json` embeds its line-ups under. */
const INSCRIPTION_KEYS = ['inscriptionLocal', 'inscriptionVisitor'] as const;

/**
 * Resolves a TP `matchEvents[].lineUpId` to the player's name using nothing
 * but the raw match file the panel already loaded: each
 * `inscription{Local,Visitor}.roster.lineUps[]` entry carries its own `id`
 * and `name` inline, so no parser, importer or database lookup is involved —
 * which is what keeps the raw panel independent of the logic under review.
 *
 * Every shape check is defensive: this reads unvalidated JSON straight off
 * disk, and a raw panel that throws is strictly worse for a reviewer than one
 * that shows an unresolved id. A missing or malformed shape yields an empty
 * map, and an id not in it is reported as `unknown id <N>` — shown rather
 * than blanked, so a resolution gap is a visible signal worth investigating.
 */
@Injectable()
export class TpRawPlayerNameResolverService {
  /** Line-up id -> player name, across both teams' embedded rosters. */
  namesFrom(file: unknown): Map<number, string> {
    const names = new Map<number, string>();
    for (const key of INSCRIPTION_KEYS) {
      for (const entry of this.lineUpsOf(file, key)) {
        const id = this.property(entry, 'id');
        const name = this.property(entry, 'name');
        if (typeof id === 'number' && typeof name === 'string') {
          names.set(id, name);
        }
      }
    }
    return names;
  }

  /** The player's name, or an explicit marker when the id is unresolved. */
  nameFor(names: ReadonlyMap<number, string>, lineUpId: number): string {
    return names.get(lineUpId) ?? `unknown id ${lineUpId}`;
  }

  private lineUpsOf(file: unknown, key: string): unknown[] {
    const roster = this.property(this.property(file, key), 'roster');
    const lineUps = this.property(roster, 'lineUps');
    return Array.isArray(lineUps) ? lineUps : [];
  }

  private property(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }
}
