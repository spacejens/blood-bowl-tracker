import type { PositionKeyword } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/**
 * The keywords a position carries, one line per rules set:
 * `BB2025 keywords: Goblin, Undead, Zombie`.
 *
 * A rules set with no keywords recorded contributes no line, and a position
 * with none at all contributes nothing -- no placeholder. A placeholder would
 * have to stand for both "this position genuinely has none" and "this rules
 * set has no keyword concept at all", which the stored data cannot tell
 * apart; saying nothing claims neither.
 *
 * The kind is deliberately not marked. A reader sees "Big Guy" next to
 * "Ogre" and needs no notation to tell a role from a creature, and every
 * extra marker competes with the star-player and elite markers the skill
 * lines already carry.
 *
 * `rows` are expected to already be in display order (`listByPosition`
 * orders by rules-set name, then positional-kind keywords before species
 * ones, then keyword name). Shared by the position
 * deepdive and the star player deepdive -- a star is stored as a `positions`
 * row, so both views must read identically. Pure text assembly, with no I/O
 * and no external state.
 */
@Injectable()
export class PositionKeywordsSectionService {
  build(rows: PositionKeyword[]): string[] {
    const byRulesSet = new Map<number, { name: string; keywords: string[] }>();
    for (const row of rows) {
      const existing = byRulesSet.get(row.rulesSetId);
      if (existing === undefined) {
        byRulesSet.set(row.rulesSetId, {
          name: row.rulesSetName,
          keywords: [row.keywordName],
        });
      } else {
        existing.keywords.push(row.keywordName);
      }
    }
    return [...byRulesSet.values()].map(
      (group) => `${group.name} keywords: ${group.keywords.join(', ')}`,
    );
  }
}
